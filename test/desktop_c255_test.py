import unittest
from desktop_c236_test import ui_app
class PreparedExpiryTests(unittest.TestCase):
    def test_current_expiry_confirmation_sends_no_old_refusal_or_final_consent(self):
        a=ui_app();a.pickup_values={};a.checkout_can_prepared_review=True;a.transfer_confirm.set(True)
        a.transfer_checkout();c=a.sent[0]
        self.assertEqual(c['action'],'restart-observed-refusal');self.assertTrue(c['preparedReviewExpired']);self.assertTrue(c['merchantExpiryConfirmed']);self.assertFalse(c['operatorObservedRefusal']);self.assertNotIn('termsAccepted',c)
    def test_unconfirmed_expired_review_sends_nothing(self):
        a=ui_app();a.pickup_values={};a.checkout_can_prepared_review=True;a.transfer_confirm.set(False);a.transfer_checkout();self.assertEqual(a.sent,[])
if __name__=='__main__':unittest.main()
