import unittest
from desktop_c236_test import ui_app

class AssistedTrialTests(unittest.TestCase):
    def test_explicit_checkbox_only_sends_assisted_trial_flags_and_no_final_terms(self):
        a=ui_app();a.pickup_values={};a.checkout_can_observed_refusal=True;a.transfer_confirm.set(True)
        a.transfer_checkout();self.assertEqual(len(a.sent),1)
        self.assertEqual(a.sent[0]['action'],'restart-observed-refusal')
        self.assertTrue(a.sent[0]['operatorObservedRefusal']);self.assertTrue(a.sent[0]['sameAccountConfirmed'])
        self.assertNotIn('termsAccepted',a.sent[0]);self.assertNotIn('expiredCheckoutUrl',a.sent[0])
    def test_no_checkbox_means_no_assisted_trial(self):
        a=ui_app();a.pickup_values={};a.checkout_can_observed_refusal=True;a.transfer_confirm.set(False)
        a.transfer_checkout();self.assertEqual(a.sent,[])

if __name__=='__main__':unittest.main()
