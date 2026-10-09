import queue
import tkinter as tk
from tkinter import ttk
import unittest
from desktop_c078_test import fake_app, FakeControl
from app import App
from ui_flow import primary_choice, current_consent

class UiControl(FakeControl):
    def __init__(self,value=False):super().__init__(value);self.options={}
    def config(self,**kw):super().config(**kw);self.options.update(kw)
    def cget(self,key):return self.state if key=='state' else self.options.get(key)

def ui_app():
    a=fake_app();a.runner.busy=False;a.pickup_values={};a.sent=[];a.checkout.send=a.sent.append
    a.primary_button=UiControl();a.main_pause_button=UiControl();a.summary_status=UiControl();a.consent_text=UiControl()
    a.current_consent=None;a.checkout_phase='BAG';a.checkout_working=False;a.checkout_submission_pending=False
    a.submit_button.state='disabled';a.final_checkbox.state='disabled'
    return a

class CompactDesktopTests(unittest.TestCase):
    def ready(self,a):
        a.checkout.events.put({'generation':1,'type':'result','state':'BLOCKED','phase':'REVIEW','pendingAction':None,'reviewReady':True,'realOrderVerified':False,'consentSummary':{'termsUrl':'https://www.apple.com.cn/shop/browse/open/salespolicies','totalCny':9999}})
        a.poll()

    def test_single_explicit_accept_button_sends_one_final_and_cannot_double_submit(self):
        a=ui_app();self.ready(a);self.assertEqual(a.primary_mode,'submit');self.assertFalse(a.final_confirm.get())
        a.primary_action();a.primary_action()
        self.assertEqual(len(a.sent),1);self.assertEqual(a.sent[0]['action'],'submit');self.assertTrue(a.sent[0]['termsAccepted'])
        self.assertFalse(a.final_confirm.get());self.assertEqual(a.primary_button.state,'disabled')

    def test_unknown_final_routes_to_lookup_not_to_submit_even_with_stale_ready_controls(self):
        a=ui_app();self.ready(a);a.checkout_submission_pending=True;a.primary_action()
        self.assertEqual(a.sent[0]['action'],'advance');self.assertNotIn('termsAccepted',a.sent[0])

    def test_readonly_pending_final_uses_only_reconcile(self):
        a=ui_app();a.checkout_readonly=True;a.checkout_submission_pending=True;a.primary_action()
        self.assertEqual(a.sent,[{'action':'reconcile'}])

    def test_pause_or_owner_loss_prevents_late_review_acceptance(self):
        for kind in ('paused','owner-lost'):
            a=ui_app();self.ready(a)
            a.checkout.events.put({'generation':1,'type':kind,'message':'FAKE stopped','canContinue':False})
            a.poll();self.ready(a);a.primary_action()
            self.assertEqual(a.sent,[]);self.assertNotEqual(getattr(a,'primary_mode',None),'submit')

    def test_current_summary_rejects_arbitrary_terms_bool_amount_and_out_of_cap(self):
        for summary in [None,{'termsUrl':'https://evil.invalid','totalCny':9999},{'termsUrl':'https://www.apple.com.cn/shop/open/salespolicies','totalCny':True},{'termsUrl':'https://www.apple.com.cn/shop/open/salespolicies','totalCny':10000}]:
            self.assertFalse(current_consent(summary))
        a=ui_app();self.ready(a);a.current_consent={'termsUrl':'https://evil.invalid','totalCny':9999};a.primary_action()
        self.assertFalse(any(c['action']=='submit' for c in a.sent))

    def test_awaiting_payment_receipt_is_shown_without_independent_verification_or_new_purchase(self):
        a=ui_app();a.checkout.events.put({'generation':1,'type':'result','state':'NEEDS_VERIFICATION','phase':'ORDER_RECEIPT','pendingAction':'submitOrder','receiptAwaitingPayment':True,'realOrderVerified':False,'reviewReady':False});a.poll()
        self.assertEqual(a.summary_status.get(),'订单已创建，待付款');self.assertIn('详情核验尚未完成',a.result.get());self.assertFalse(a.checkout_complete)
        a.primary_action();self.assertEqual(a.sent[0]['action'],'advance');self.assertNotIn('termsAccepted',a.sent[0])

    def test_receipt_flag_on_foreign_readonly_or_wrong_phase_is_not_success(self):
        for change in ({'readOnly':True},{'phase':'BAG'}):
            a=ui_app();v={'generation':1,'type':'result','state':'NEEDS_VERIFICATION','phase':'ORDER_RECEIPT','pendingAction':'submitOrder','receiptAwaitingPayment':True,'realOrderVerified':False};v.update(change);a.checkout.events.put(v);a.poll()
            self.assertFalse(a.checkout_receipt);self.assertNotEqual(a.summary_status.get(),'订单已创建，待付款')

    def test_receipt_status_does_not_survive_a_new_unconfirmed_result(self):
        a=ui_app();a.checkout.events.put({'generation':1,'type':'result','state':'NEEDS_VERIFICATION','phase':'ORDER_RECEIPT','pendingAction':'submitOrder','receiptAwaitingPayment':True});a.poll()
        a.checkout.events.put({'generation':1,'type':'result','state':'NEEDS_VERIFICATION','phase':'UNKNOWN','pendingAction':'submitOrder'});a.poll()
        self.assertFalse(a.checkout_receipt);self.assertIn('详情仍待核验',a.result.get())

    def test_primary_cannot_submit_outside_review(self):
        for phase in ('BAG','PAYMENT','UNKNOWN','ORDER_RECEIPT'):
            action,_=primary_choice(busy=True,working=False,readonly=False,paused=False,owner_lost=False,attempted=False,complete=False,can_open=False,can_advance=True,can_reconcile=False,can_submit=True,consent_current=True,phase=phase)
            self.assertNotEqual(action,'submit')

    def test_real_widget_tree_defaults_to_r1_with_two_main_actions_and_advanced_tools(self):
        root=tk.Tk();root.withdraw()
        try:
            a=App(root);root.update_idletasks()
            self.assertEqual(a.browser_choice.get(),'正常 Chrome 结账通道');self.assertEqual(len(a.mode_tabs.tabs()),2)
            main=root.nametowidget(a.mode_tabs.tabs()[0]);advanced=root.nametowidget(a.mode_tabs.tabs()[1])
            def buttons(w):return ([w] if isinstance(w,ttk.Button) else [])+[b for c in w.winfo_children() for b in buttons(c)]
            self.assertEqual(set(buttons(main)),{a.primary_button,a.main_pause_button})
            self.assertTrue(str(a.start_button).startswith(str(advanced)));self.assertEqual(a.final_checkbox.winfo_manager(),'')
            self.assertEqual(a.submit_button.winfo_manager(),'');self.assertFalse(a.checkout.busy)
            root.after_cancel(a.timer)
        finally:root.destroy()

if __name__=='__main__':unittest.main()
