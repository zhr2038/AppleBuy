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
from app import App

class FakeControl:
    def __init__(self,value=False):self.value=value;self.state='normal'
    def get(self):return self.value
    def set(self,value):self.value=value
    def config(self,**kw):self.state=kw.get('state',self.state)

def fake_app():
    app=App.__new__(App)
    for name in ('final_confirm','final_checkbox','advance_button','reconcile_button','submit_button','transfer_button','transfer_checkbox','transfer_confirm','checkout_button','start_button','probe_button','checkout_stop_button','status','result'):
        setattr(app,name,FakeControl())
    app.root=type('Root',(),{'after':lambda *args:1})()
    app.runner=type('Runner',(),{'events':queue.Queue(),'generation':1})()
    app.checkout=type('Checkout',(),{'events':queue.Queue(),'generation':1,'busy':True,'terminal':lambda *args:True})()
    app.pickup_values={'identitySuffix':FakeControl('123')}
    return app

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
    def test_current_review_consent_resets_on_every_new_result(self):
        app=fake_app()
        app.checkout.events.put({'generation':1,'type':'result','phase':'REVIEW','reviewReady':True})
        app.poll();self.assertEqual(app.final_checkbox.state,'normal')
        app.final_confirm.set(True)
        app.checkout.events.put({'generation':1,'type':'blocked','message':'FAKE unconfirmed'})
        app.poll();self.assertFalse(app.final_confirm.get());self.assertEqual(app.final_checkbox.state,'disabled');self.assertEqual(app.submit_button.state,'disabled')
    def test_readonly_ready_disables_purchase_and_worker_end_disables_transfer(self):
        app=fake_app();app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'message':'FAKE readonly'})
        app.poll();self.assertEqual(app.advance_button.state,'disabled');self.assertEqual(app.reconcile_button.state,'normal');self.assertEqual(app.transfer_button.state,'normal')
        app.checkout.events.put({'generation':1,'type':'worker-ended'})
        app.poll();self.assertEqual(app.transfer_button.state,'disabled');self.assertEqual(app.transfer_checkbox.state,'disabled')
    def test_transfer_validates_identity_suffix_before_sending(self):
        app=fake_app();app.transfer_confirm.set(True)
        app.transfer_checkout();self.assertIn('格式不正确',app.status.get());self.assertTrue(app.transfer_confirm.get())
    def test_readonly_blocked_does_not_reenable_advance(self):
        app=fake_app();app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'message':'FAKE readonly'});app.poll()
        app.checkout.events.put({'generation':1,'type':'blocked','message':'FAKE busy'});app.poll()
        self.assertEqual(app.advance_button.state,'disabled');self.assertEqual(app.reconcile_button.state,'normal')
    def test_transfer_disables_reconcile_during_send_and_nonreadonly_result(self):
        app=fake_app();sent=[];app.checkout.send=sent.append;app.transfer_confirm.set(True);app.pickup_values={}
        app.transfer_checkout();self.assertEqual(app.reconcile_button.state,'disabled');self.assertEqual(sent[0]['action'],'transfer')
        app.checkout.events.put({'generation':1,'type':'result','phase':'AUTH','readOnly':False});app.poll()
        self.assertEqual(app.reconcile_button.state,'disabled');self.assertEqual(app.advance_button.state,'normal')
    def test_transfer_progress_nonreadonly_allows_safe_advance_after_blocked(self):
        app=fake_app();app.checkout.send=lambda message:None;app.pickup_values={}
        app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'message':'FAKE readonly'});app.poll()
        app.transfer_confirm.set(True);app.transfer_checkout()
        app.checkout.events.put({'generation':1,'type':'progress','readOnly':False,'phase':'REVIEW'});app.poll()
        app.checkout.events.put({'generation':1,'type':'blocked','message':'FAKE review changed'});app.poll()
        self.assertEqual(app.advance_button.state,'normal');self.assertEqual(app.reconcile_button.state,'disabled')
    def test_transfer_failure_before_write_keeps_readonly_advance_disabled(self):
        app=fake_app();app.checkout.send=lambda message:None;app.pickup_values={}
        app.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'message':'FAKE readonly'});app.poll()
        app.transfer_confirm.set(True);app.transfer_checkout()
        app.checkout.events.put({'generation':1,'type':'blocked','message':'FAKE empty bag'});app.poll()
        self.assertEqual(app.advance_button.state,'disabled')
    def test_pause_requests_in_session_pause_and_waits_before_enabling_resume(self):
        app=fake_app();calls=[];app.checkout.pause=lambda:calls.append('pause')
        app.stop_checkout();self.assertEqual(calls,['pause']);self.assertTrue(app.checkout_paused);self.assertEqual(app.advance_button.state,'disabled')
        app.checkout.events.put({'generation':1,'type':'paused','readOnly':False,'canContinue':True});app.poll();self.assertEqual(app.advance_button.state,'normal');self.assertTrue(app.checkout_paused)
    def test_explicit_continue_sends_resume_not_new_start(self):
        app=fake_app();app.checkout_paused=True;app.pickup_values={};calls=[];app.checkout.send=calls.append
        app.advance_checkout();self.assertEqual(calls[0]['action'],'resume');self.assertFalse(app.checkout_paused);self.assertFalse(app.final_confirm.get())
    def test_paused_ui_does_not_consume_late_result_as_new_consent(self):
        app=fake_app();app.checkout_paused=True;app.advance_button.state='disabled';app.final_confirm.set(False)
        app.checkout.events.put({'generation':1,'type':'result','phase':'REVIEW','reviewReady':True,'paused':True});app.poll()
        self.assertEqual(app.advance_button.state,'disabled');self.assertEqual(app.final_checkbox.state,'disabled')

class C103FeedbackTests(unittest.TestCase):
    def test_pause_failure_is_visible_and_does_not_offer_unconfirmed_resume(self):
        app=fake_app();app.checkout.pause=lambda:None;app.stop_checkout()
        app.checkout.events.put({'generation':1,'type':'blocked','paused':False,'message':'FAKE pause result unconfirmed'})
        app.poll();self.assertEqual(app.status.get(),'FAKE pause result unconfirmed');self.assertEqual(app.advance_button.state,'disabled');self.assertEqual(app.checkout_stop_button.state,'normal')
    def test_resume_rejection_keeps_acknowledged_controls_and_shows_reason(self):
        app=fake_app();app.checkout.send=lambda v:None;app.pickup_values={}
        app.checkout.events.put({'generation':1,'type':'paused','readOnly':False,'canContinue':True});app.poll();app.advance_checkout()
        app.checkout.events.put({'generation':1,'type':'blocked','paused':True,'message':'FAKE still draining'})
        app.poll();self.assertEqual(app.status.get(),'FAKE still draining');self.assertTrue(app.checkout_paused);self.assertEqual(app.advance_button.state,'normal')
    def test_successful_resume_reenables_pause_without_reenabling_final_consent(self):
        app=fake_app();app.checkout.send=lambda v:None;app.pickup_values={}
        app.checkout_stop_button.state='disabled'
        app.checkout.events.put({'generation':1,'type':'paused','readOnly':False,'canContinue':True});app.poll();app.advance_checkout()
        app.checkout.events.put({'generation':1,'type':'result','phase':'AUTH','readOnly':False,'paused':False});app.poll()
        self.assertFalse(app.checkout_paused);self.assertEqual(app.checkout_stop_button.state,'normal');self.assertEqual(app.final_checkbox.state,'disabled')
    def test_owner_loss_while_paused_disables_all_checkout_and_reports_loss(self):
        app=fake_app();app.checkout_paused=True
        app.checkout.events.put({'generation':1,'type':'owner-lost','message':'FAKE execution authority lost'})
        app.poll();self.assertEqual(app.status.get(),'FAKE execution authority lost')
        for name in ('advance_button','reconcile_button','transfer_button','transfer_checkbox','submit_button','final_checkbox','checkout_stop_button'):
            self.assertEqual(getattr(app,name).state,'disabled')

if __name__=='__main__':unittest.main()
