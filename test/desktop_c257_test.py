import unittest, tkinter as tk
from desktop_c236_test import ui_app,UiControl
from app import App

class SmoothLoginTests(unittest.TestCase):
    def login_app(self):
        a=ui_app();a.browser_choice=UiControl('正常 Chrome 结账通道');a.auto_login=UiControl(True);a.login_account=UiControl('fake@example.invalid');a.login_password=UiControl('FAKE-only-secret');return a
    def test_session_password_separate_from_pickup_and_no_terms_on_start(self):
        a=self.login_app();a.send_checkout({'action':'advance','privatePickupData':{'email':'contact@example.invalid'}})
        self.assertEqual(a.sent[0]['privateLogin']['password'],'FAKE-only-secret')
        self.assertNotIn('password',a.sent[0]['privatePickupData']);self.assertNotIn('termsAccepted',a.sent[0])
    def test_disabled_login_clears_peer_credentials(self):
        for mode in ('disabled',):
            a=self.login_app()
            if mode=='empty':a.login_password.set('')
            else:a.auto_login.set(False)
            a.send_checkout({'action':'advance'});self.assertIsNone(a.sent[0]['privateLogin'])
    def test_empty_password_uses_visible_chrome_autofill_without_password_manager(self):
        a=self.login_app();a.login_password.set('');a.send_checkout({'action':'advance'})
        self.assertEqual(a.sent[0]['privateLogin'],{'account':'fake@example.invalid','password':''})
    def test_submit_and_stop_do_not_carry_password(self):
        for action in ('submit','stop','pause'):
            a=self.login_app();a.send_checkout({'action':action});self.assertNotIn('privateLogin',a.sent[0])
    def test_saved_contact_prefills_login_and_suffix_without_password(self):
        root=tk.Tk();root.withdraw()
        class Profile:
            def load(self):return {'email':'fake@example.invalid','identitySuffix':'0000'}
        try:
            a=App(root,profile=Profile());a.load_pickup_profile()
            self.assertEqual(a.login_account.get(),'fake@example.invalid');self.assertEqual(a.pickup_values['identitySuffix'].get(),'0000');self.assertEqual(a.login_password.get(),'')
            root.after_cancel(a.timer)
        finally:root.destroy()
    def test_malformed_account_never_sends_private_payload(self):
        a=self.login_app();a.login_account.set('wrong')
        with self.assertRaises(ValueError):a.send_checkout({'action':'advance'})
        self.assertEqual(a.sent,[])
    def test_primary_click_scopes_agreement_but_pending_final_never_gets_it(self):
        a=self.login_app();a.one_click_start=True;a.advance_button.state='normal';a.checkout_readonly=False;a.checkout.busy=True
        a.primary_action();self.assertEqual(a.sent[0]['startTermsUrl'],'https://www.apple.com.cn/shop/browse/open/salespolicies')
        a=self.login_app();a.one_click_start=True;a.advance_button.state='normal';a.checkout_submission_pending=True;a.checkout.busy=True
        a.primary_action();self.assertNotIn('startTermsUrl',a.sent[0])

if __name__=='__main__':unittest.main()
