import unittest
from desktop_c078_test import fake_app, FakeControl

class RecoveryPolicyUiTests(unittest.TestCase):
    def fixture(self, policy):
        a=fake_app();a.pickup_values={};a.sent=[];a.checkout.send=a.sent.append
        a.expired_checkout_url=FakeControl('https://secure10.www.apple.com.cn/shop/checkout')
        a.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'canRestartExpiredPayment':True,'canPolicyReviewRecovery':policy,'message':'FAKE ready'})
        a.poll();return a

    def test_policy_entry_still_requires_one_current_operator_start(self):
        a=self.fixture(True);a.transfer_checkout();self.assertEqual(a.sent,[])
        a.transfer_confirm.set(True);a.transfer_checkout()
        self.assertTrue(a.sent[0]['automaticRecoveryApproved'])
        self.assertFalse(a.sent[0]['additionalRecoveryApproved'])
        self.assertEqual(a.sent[0]['action'],'restart-payment')
        self.assertFalse(a.final_confirm.get())

    def test_ordinary_entry_does_not_mint_policy(self):
        a=self.fixture(False);a.transfer_confirm.set(True);a.transfer_checkout()
        self.assertFalse(a.sent[0]['automaticRecoveryApproved'])

if __name__=='__main__':unittest.main()
