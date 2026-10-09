import unittest
from desktop_c078_test import fake_app, FakeControl

class AdditionalReviewUiTests(unittest.TestCase):
    def fixture(self, extra):
        a=fake_app();a.pickup_values={};a.sent=[];a.checkout.send=a.sent.append
        a.expired_checkout_url=FakeControl('https://secure10.www.apple.com.cn/shop/checkout')
        a.checkout.events.put({'generation':1,'type':'ready','readOnly':True,'canRestartExpiredPayment':True,'canAdditionalReviewRecovery':extra,'message':'FAKE ready'})
        a.poll();return a

    def test_extra_recovery_requires_explicit_existing_confirmation(self):
        a=self.fixture(True);a.transfer_checkout();self.assertEqual(a.sent,[])
        a.transfer_confirm.set(True);a.transfer_checkout()
        self.assertEqual(a.sent[0]['action'],'restart-payment')
        self.assertTrue(a.sent[0]['additionalRecoveryApproved'])
        self.assertFalse(a.final_confirm.get())
        self.assertFalse(a.transfer_confirm.get())

    def test_ordinary_recovery_does_not_acquire_additional_confirmation(self):
        a=self.fixture(False);a.transfer_confirm.set(True);a.transfer_checkout()
        self.assertFalse(a.sent[0]['additionalRecoveryApproved'])

if __name__=='__main__':unittest.main()
