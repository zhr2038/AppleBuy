import unittest
from desktop_c236_test import ui_app, UiControl

class NewPurchaseUiTests(unittest.TestCase):
    def app(self):
        a=ui_app();a.browser_choice=UiControl('正常 Chrome 结账通道');a.checkout_paused=False
        a.previous_order_number=UiControl('W1234567890');a.new_purchase_confirm=UiControl(False)
        a.checkout_submission_pending=True
        return a

    def test_old_unknown_is_not_cleared_or_sent_by_missing_confirmation(self):
        a=self.app();a.new_purchase();self.assertEqual(a.sent,[]);self.assertTrue(a.checkout_submission_pending)

    def test_explicit_action_only_sent_once_and_does_not_clear_final_before_backend_commit(self):
        a=self.app();a.new_purchase_confirm.set(True);a.new_purchase();a.new_purchase()
        self.assertEqual(len(a.sent),1);self.assertEqual(a.sent[0]['action'],'new-purchase')
        self.assertTrue(a.sent[0]['originalOrderAssociated']);self.assertTrue(a.checkout_submission_pending)
        self.assertFalse(a.new_purchase_confirm.get());self.assertFalse(a.final_confirm.get())
        self.assertNotIn('W1234567890',str(a.result.get()))

    def test_only_committed_new_purchase_progress_resets_current_ui_submission_flags(self):
        a=self.app();a.checkout.events.put({'generation':1,'type':'progress','state':'RUNNING','phase':'BAG','pendingAction':None,'newPurchaseStarted':True});a.poll()
        self.assertFalse(a.checkout_submission_pending);self.assertFalse(a.checkout_readonly)

    def test_invalid_reference_or_paused_prevents_dispatch(self):
        for paused,ref in [(True,'W1234567890'),(False,'bad')]:
            a=self.app();a.new_purchase_confirm.set(True);a.checkout_paused=paused;a.previous_order_number.set(ref);a.new_purchase();self.assertEqual(a.sent,[])

if __name__=='__main__':unittest.main()
