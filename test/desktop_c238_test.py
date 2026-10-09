import sys, unittest, tempfile, os
import tkinter as tk
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src/desktop'))
from pickup_profile import PickupProfile,validate
from desktop_c236_test import ui_app
import app as app_module

FAKE={'lastName':'测试','firstName':'虚构','phone':'10000000000','email':'fake@example.invalid','identitySuffix':'0000'}
class AutomationTests(unittest.TestCase):
    @unittest.skipUnless(os.name=='nt','Windows DPAPI only')
    def test_real_user_dpapi_roundtrip_does_not_save_plaintext_and_can_forget(self):
        with tempfile.TemporaryDirectory() as d:
            p=PickupProfile(Path(d)/'profile.bin');self.assertIsNone(p.load());p.save(FAKE)
            raw=p.path.read_bytes();self.assertNotIn(b'fake@example.invalid',raw);self.assertNotIn(b'10000000000',raw)
            self.assertEqual(p.load(),FAKE);p.forget();self.assertIsNone(p.load())
    def test_password_or_invalid_input_is_rejected_before_save(self):
        for v in [dict(FAKE,password='FAKE'),dict(FAKE,identitySuffix='000'),dict(FAKE,email='bad'),dict(FAKE,phone='bad'),dict(FAKE,lastName='bad\nvalue')]:
            with self.assertRaises(ValueError):validate(v)
    def test_corrupt_profile_never_returns_partial_fields(self):
        with tempfile.TemporaryDirectory() as d:
            p=PickupProfile(Path(d)/'profile.bin');p.path.write_bytes(b'broken')
            with self.assertRaises(ValueError):p.load()
    def test_failed_encryption_preserves_existing_encrypted_file(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'profile.bin';path.write_bytes(b'original-ciphertext')
            def broken(*args):raise RuntimeError('FAKE unavailable')
            with self.assertRaises(RuntimeError):PickupProfile(path,codec=broken).save(FAKE)
            self.assertEqual(path.read_bytes(),b'original-ciphertext')
    def test_query_status_overrides_old_receipt_without_new_submit(self):
        a=ui_app();a.checkout_submission_pending=True;a.checkout_receipt=True
        a.checkout.events.put({'generation':1,'type':'result','phase':'ORDER_DETAIL','state':'NEEDS_VERIFICATION','pendingAction':'submitOrder','realOrderVerified':False,'orderCheck':{'state':'detail','status':'cancelled','sameReference':True,'productMatches':True,'totalCny':9999,'storeMatches':False}})
        a.poll();self.assertIn('已取消',a.summary_status.get());self.assertFalse(a.checkout_complete);self.assertEqual(a.sent,[])
    def test_existing_unpaid_or_login_is_not_displayed_as_clear(self):
        for state,label in [('unpaid-exists','已有同款'),('auth','需要登录'),('unknown','未确认')]:
            a=ui_app();a.checkout.events.put({'generation':1,'type':'result','phase':'UNKNOWN','state':'NEEDS_VERIFICATION','orderCheck':{'state':state}});a.poll();self.assertIn(label,a.summary_status.get());self.assertEqual(a.sent,[])
    def test_default_real_app_construction_cannot_read_or_write_a_production_profile(self):
        root=tk.Tk();root.withdraw()
        try:
            with patch.object(app_module,'PickupProfile',side_effect=AssertionError('No production profile in tests')):
                a=app_module.App(root);a.load_pickup_profile();self.assertIsNone(a.profile)
                a.remember_pickup.set(True)
                with self.assertRaises(AttributeError):a.save_pickup_if_selected()
                root.after_cancel(a.timer)
        finally:root.destroy()
    def test_profile_is_loaded_only_from_explicit_injected_temp_storage(self):
        root=tk.Tk();root.withdraw()
        try:
            class Fake:
                calls=0
                def load(self):self.calls+=1;return FAKE.copy()
            profile=Fake();a=app_module.App(root,profile=profile);self.assertEqual(profile.calls,0)
            a.load_pickup_profile();self.assertEqual(profile.calls,1);self.assertEqual(a.pickup_values['email'].get(),FAKE['email'])
            self.assertTrue(a.remember_pickup.get());root.after_cancel(a.timer)
        finally:root.destroy()

if __name__=='__main__':unittest.main()
