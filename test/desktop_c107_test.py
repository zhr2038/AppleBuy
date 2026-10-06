"""Fake GUI and worker-construction checks; no browser or account access."""
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src/desktop'))
from app import App
from interactive_child import CheckoutRunner
from desktop_c078_test import fake_app,FakeControl

class C107BrowserTests(unittest.TestCase):
    def test_completed_worker_does_not_carry_retention_consent_into_the_next_start(self):
        app=fake_app();app.keep_session=FakeControl(True)
        app.checkout.events.put({'generation':1,'type':'worker-ended'});app.poll()
        self.assertFalse(app.keep_session.get());self.assertEqual(app.keep_session_checkbox.state,'normal')
    def test_new_start_clears_stale_failure_and_locks_browser_and_retention_controls(self):
        app=fake_app();app.browser_choice=FakeControl('Chrome');app.keep_session=FakeControl(True);app.checkout.busy=False;app.runner.busy=False;calls=[]
        app.checkout.open=lambda **kw:calls.append(kw) or True;app.browser_diagnostic.set('OLD HTTP 541')
        app.open_checkout();self.assertNotIn('541',app.browser_diagnostic.get());self.assertEqual(calls,[{'browser_channel':'chrome','keep_session':True}]);self.assertEqual(app.browser_picker.state,'disabled');self.assertEqual(app.keep_session_checkbox.state,'disabled')
    def test_edge_worker_argument_is_fixed_and_a_second_open_does_not_spawn(self):
        runner=CheckoutRunner();calls=[]
        with patch('interactive_child.InteractiveChild',side_effect=lambda *a:calls.append(a) or object()):
            self.assertTrue(runner.open('msedge'));self.assertFalse(runner.open('chrome'))
        self.assertEqual(len(calls),1);self.assertEqual(calls[0][0][-1],'--browser=msedge')
    def test_unsupported_browser_rejects_before_any_worker_spawn(self):
        runner=CheckoutRunner()
        with patch('interactive_child.InteractiveChild') as child:
            with self.assertRaises(ValueError):runner.open('FAKE-browser')
            child.assert_not_called()
    def test_authentication_retention_is_an_explicit_worker_flag_and_defaults_off(self):
        calls=[];runner=CheckoutRunner()
        with patch('interactive_child.InteractiveChild',side_effect=lambda *a:calls.append(a) or object()):runner.open('chrome',keep_session=True)
        self.assertEqual(calls[0][0][-1],'--keep-session')
        runner=CheckoutRunner()
        with patch('interactive_child.InteractiveChild') as child:
            with self.assertRaises(ValueError):runner.open('chrome',keep_session='yes')
            child.assert_not_called()
    def test_network_status_is_diagnostic_only_while_paused_and_cannot_enable_purchase(self):
        app=fake_app();app.checkout_paused=True;app.advance_button.state='disabled';app.submit_button.state='disabled'
        app.checkout.events.put({'generation':1,'type':'network-status','browser':'msedge','host':'secure11.www.apple.com.cn','status':541,'url':'FAKE-private-value'})
        app.poll();self.assertIn('HTTP 541',app.browser_diagnostic.get());self.assertNotIn('FAKE-private-value',app.browser_diagnostic.get());self.assertEqual(app.advance_button.state,'disabled');self.assertEqual(app.submit_button.state,'disabled')
    def test_invalid_diagnostic_host_or_status_is_not_displayed(self):
        app=fake_app();app.browser_diagnostic.set('unchanged')
        app.checkout.events.put({'generation':1,'type':'network-status','browser':'msedge','host':'FAKE-private-host','status':541})
        app.checkout.events.put({'generation':1,'type':'network-status','browser':'msedge','host':'idmsa.apple.com.cn','status':True})
        app.poll();self.assertEqual(app.browser_diagnostic.get(),'unchanged')

if __name__=='__main__':unittest.main()
