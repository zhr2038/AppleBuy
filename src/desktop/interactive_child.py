"""Contained private protocol to this application's own Node worker; no desktop/browser automation API."""
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import uuid
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/delegation'))
from process_tree import OwnedProcess,ProcessTreeUnresolved

class InteractiveChild:
    def __init__(self,args,cwd,events,generation=0):
        self.events=events
        self.done=threading.Event()
        self.cleanup_confirmed=False
        self.generation=generation
        self.write_lock=threading.Lock()
        self.receipt=ROOT/'.local'/('desktop-checkout-child-'+uuid.uuid4().hex+'.json')
        def started(pid):
            self.receipt.write_text(json.dumps({'scope':'owned desktop checkout worker','pid':pid,'terminal':False}),encoding='utf8')
        self.owned=OwnedProcess(args,Path(cwd),started)
        def drain_errors():
            # Authentication errors can contain private URLs. Drain and discard; never display or record raw stderr.
            for _ in self.owned.process.stderr:pass
        self.error_thread=threading.Thread(target=drain_errors,daemon=True)
        try:
            self.error_thread.start()
            threading.Thread(target=self._read,daemon=True).start()
        except BaseException:
            try:
                self.owned.terminate_tree();self.owned.close()
                if self.error_thread.is_alive():self.error_thread.join(timeout=1)
                for stream in (self.owned.process.stdin,self.owned.process.stdout,self.owned.process.stderr):stream.close()
                self.cleanup_confirmed=True
                self.receipt.write_text(json.dumps({'scope':'owned desktop checkout worker','terminal':True,'cleanupConfirmed':True}),encoding='utf8')
            except Exception:
                self.receipt.write_text(json.dumps({'scope':'owned desktop checkout worker','terminal':False,'cleanupConfirmed':False}),encoding='utf8')
                self.done.set()
                self.events.put({'scope':'desktop-pro-checkout','type':'worker-ended','cleanupConfirmed':False,'generation':self.generation})
                return  # Retain this unresolved owner; another worker must not start.
            self.done.set()
            raise

    def _read(self):
        try:
            for line in self.owned.process.stdout:
                if len(line)>24000:continue
                try:v=json.loads(line)
                except (ValueError,TypeError):continue
                if isinstance(v,dict) and v.get('scope')=='desktop-pro-checkout':self.events.put({**v,'generation':self.generation})
            self.owned.process.wait(timeout=5)
        finally:
            try:
                self.owned.terminate_tree();self.owned.close();self.cleanup_confirmed=True
                self.error_thread.join(timeout=1)
                for stream in (self.owned.process.stdin,self.owned.process.stdout,self.owned.process.stderr):
                    stream.close()
                self.receipt.write_text(json.dumps({'scope':'owned desktop checkout worker','terminal':True,'cleanupConfirmed':True}),encoding='utf8')
            except Exception:
                self.cleanup_confirmed=False
                self.receipt.write_text(json.dumps({'scope':'owned desktop checkout worker','terminal':False,'cleanupConfirmed':False}),encoding='utf8')
            finally:
                self.done.set()
                self.events.put({'scope':'desktop-pro-checkout','type':'worker-ended','cleanupConfirmed':self.cleanup_confirmed,'generation':self.generation})

    def send(self,value):
        if self.done.is_set():raise RuntimeError('Worker is terminal or unresolved')
        with self.write_lock:
            self.owned.process.stdin.write(json.dumps(value,ensure_ascii=False)+'\n')
            self.owned.process.stdin.flush()

    def stop(self):
        if not self.done.is_set():
            try:self.send({'action':'stop'})
            except Exception:pass
            if not self.done.wait(5):
                self.owned.terminate_tree()
                if not self.done.wait(5):raise ProcessTreeUnresolved('Owned checkout worker did not confirm cleanup')
        if not self.cleanup_confirmed:raise ProcessTreeUnresolved('Owned checkout cleanup unconfirmed')

class CheckoutRunner:
    def __init__(self):self.events=queue.Queue();self.child=None;self.generation=0
    @property
    def busy(self):return self.child is not None
    def open(self,browser_channel='chrome',keep_session=False):
        if browser_channel not in ('chrome','msedge','native-chrome'):raise ValueError('Browser choice is not enabled')
        if type(keep_session) is not bool:raise ValueError('Session choice is not enabled')
        if browser_channel=='native-chrome' and keep_session:raise ValueError('Native channel cannot retain or copy a profile')
        if self.child is not None:return False
        from shutil import which
        node=which('node')
        if not node:raise RuntimeError('Node unavailable')
        self.generation+=1
        args=[node,str(ROOT/'src/desktop/native-purchase-worker.mjs')] if browser_channel=='native-chrome' else [node,str(ROOT/'src/desktop/purchase-worker.mjs'),'--browser='+browser_channel]
        if keep_session:args.append('--keep-session')
        self.child=InteractiveChild(args,ROOT,self.events,self.generation)
        return True
    def send(self,value):
        if self.child is None:raise RuntimeError('No checkout session')
        self.child.send(value)
    def pause(self):
        self.send({'action':'pause'})
    def terminal(self):
        if self.child and self.child.done.is_set() and self.child.cleanup_confirmed:self.child=None;return True
        return False
    def stop(self):
        if self.child:
            self.generation+=1
            self.child.stop();self.child=None
