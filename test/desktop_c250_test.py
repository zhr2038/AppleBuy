import unittest
from desktop_c236_test import ui_app, UiControl

class EarlyCheckoutUiTests(unittest.TestCase):
    def test_early_recovery_uses_existing_control_with_specific_action_and_no_final_consent(self):
        a=ui_app();a.transfer_confirm.set(True);a.pickup_values={};a.checkout_can_reopen_initial=True
        a.expired_checkout_url=UiControl('https://secure11.www.apple.com.cn/shop/checkout');a.checkout_working=False
        a.transfer_checkout();self.assertEqual(len(a.sent),1);self.assertEqual(a.sent[0]['action'],'reopen-initial')
        self.assertEqual(a.sent[0]['expiredCheckoutUrl'],'https://secure11.www.apple.com.cn/shop/checkout')
        self.assertNotIn('termsAccepted',a.sent[0]);self.assertFalse(a.final_confirm.get())

    def test_unknown_or_query_bearing_checkout_address_is_not_sent(self):
        a=ui_app();a.transfer_confirm.set(True);a.pickup_values={};a.checkout_can_reopen_initial=True
        a.expired_checkout_url=UiControl('https://secure11.www.apple.com.cn/shop/checkout?secret=FAKE');a.transfer_checkout();self.assertEqual(a.sent,[])

if __name__=='__main__':unittest.main()
