import unittest
from desktop_c078_test import fake_app

class ReviewDiagnosticUiTests(unittest.TestCase):
    def test_closed_diagnostic_shown_without_enabling_final(self):
        a=fake_app()
        a.checkout.events.put({'generation':1,'type':'result','state':'NEEDS_VERIFICATION','phase':'REVIEW','reviewReady':False,'reviewDiagnostic':['document-changed','terms']})
        a.poll()
        self.assertIn('页面已更换、当前条款识别',a.result.get())
        self.assertEqual(a.submit_button.state,'disabled')
        self.assertEqual(a.final_checkbox.state,'disabled')

    def test_arbitrary_diagnostic_or_other_phase_not_displayed(self):
        for phase,codes in [('REVIEW',['FAKE_PRIVATE']),('BAG',['terms']),('REVIEW',{'terms':'FAKE_PRIVATE'})]:
            a=fake_app();a.result.set('原结果')
            a.checkout.events.put({'generation':1,'type':'progress','state':'NEEDS_VERIFICATION','phase':phase,'reviewDiagnostic':codes})
            a.poll()
            self.assertEqual(a.result.get(),'原结果')

if __name__=='__main__':unittest.main()
