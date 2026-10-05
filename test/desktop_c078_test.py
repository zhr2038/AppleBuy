import importlib.util
from pathlib import Path
import queue
import sys
import time
import unittest
from unittest.mock import patch
import io
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src/desktop'))
from interactive_child import InteractiveChild

class DesktopWorkerTests(unittest.TestCase):
    def test_owned_protocol_roundtrip_and_cleanup(self):
        events=queue.Queue()
        script="const r=require('readline').createInterface({input:process.stdin});console.log(JSON.stringify({scope:'desktop-pro-checkout',type:'ready'}));r.on('line',s=>{const c=JSON.parse(s);console.log(JSON.stringify({scope:'desktop-pro-checkout',type:'result',phase:'FAKE',seen:c.action}));if(c.action==='stop'){r.close();process.stdin.destroy()}})"
        child=InteractiveChild(['node','-e',script],ROOT,events,generation=3)
        ready=events.get(timeout=5);self.assertEqual(ready['type'],'ready');self.assertEqual(ready['generation'],3)
        child.send({'action':'observe'});result=events.get(timeout=5);self.assertEqual(result['seen'],'observe')
        child.stop();self.assertTrue(child.done.is_set());self.assertTrue(child.cleanup_confirmed)
    def test_reader_start_failure_cleans_its_owned_process(self):
        calls=[]
        class FakeOwned:
            def __init__(self,args,cwd,started):
                started(99999)
                self.process=type('FakeProcess',(),{'stdin':io.StringIO(),'stdout':io.StringIO(),'stderr':io.StringIO()})()
            def terminate_tree(self):calls.append('terminate')
            def close(self):calls.append('close')
        with patch('interactive_child.OwnedProcess',FakeOwned),patch('interactive_child.threading.Thread.start',side_effect=RuntimeError('FAKE no thread')):
            with self.assertRaises(RuntimeError):InteractiveChild(['FAKE'],ROOT,queue.Queue())
        self.assertEqual(calls,['terminate','close'])

if __name__=='__main__':unittest.main()
