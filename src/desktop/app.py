"""Native offline entry. Executes the existing network-guarded engine; no browser/session access."""
from __future__ import annotations
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import threading
import sys
import tkinter as tk
from tkinter import ttk
from tkinter import filedialog

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from contained_child import ContainedChild
from interactive_child import CheckoutRunner
from ui_flow import primary_choice, current_consent
SCENARIO = "last-slot-three-dates"
TITLE = "AppleBuy 桌面助手 · Pro 结账候选"

def command(node: str) -> list[str]:
    return [node, str(ROOT / "src" / "cli.ts"), "rehearse", "--scenario", SCENARIO, "--json"]

def probe_command(node: str) -> list[str]:
    return [node, str(ROOT / "src" / "desktop" / "public-probe.mjs")]

def existing_chrome_command(node: str) -> list[str]:
    return [node,str(ROOT/'src/desktop/chrome-readonly-probe.mjs')]

def classify_existing_chrome(raw: str, exit_code: int) -> dict:
    if exit_code!=0 or len(raw)>20000:raise ValueError('Chrome connection unconfirmed')
    rows=[json.loads(line) for line in raw.splitlines() if line.startswith('{')];value=rows[-1] if rows else {}
    if value.get('scope')!='existing-chrome-readonly' or value.get('readOnly') is not True or type(value.get('mutationCount')) is not int or value.get('mutationCount')!=0 or value.get('tabClosed') is not True or value.get('oldRecordUnchanged') is not True or value.get('phase') not in ('EMPTY_BAG','BAG','AUTH','UNKNOWN'):raise ValueError('Chrome result unconfirmed')
    phase=value['phase'];label={'EMPTY_BAG':'官网购物袋为空；旧未知加购仍保留，不再次加购','BAG':'已读取当前购物袋；此步骤不开始结账','AUTH':'正常 Chrome 仍要求本人登录','UNKNOWN':'页面未确认，不能推断购物袋或登录状态'}[phase]
    return {'message':'正常 Chrome 只读核对：'+label+'；登录及账户身份未核实。','existingChromeProbe':True,'phase':phase}

def classify_probe(raw: str, exit_code: int) -> dict:
    if exit_code != 0 or len(raw) > 1_000_000:
        raise ValueError("官网预检未完成")
    rows = [json.loads(line) for line in raw.splitlines() if line.startswith("{")]
    value = next((v for v in reversed(rows) if v.get("type") == "result"), None)
    if not value or value.get("scope") != "public-before-add" or value.get("addSent") is not False or value.get("personalProfileUsed") is not False or value.get("browserClosed") is not True:
        raise ValueError("官网预检证据不完整")
    if value.get("state") == "VALIDATED" and value.get("quoteCny") == 9999 and value.get("skuPath") == "/shop/buy-iphone/iphone-18-pro/mjt74ch/a":
        return {"message": "官网 Pro 配置核对完成：256GB 黑色、¥9,999、不折抵、不加 AppleCare；停在加购前。", "publicProbe": True}
    return {"message": "官网预检未确认完成；未加购，原未知任务保持。", "publicProbe": True}

def classify(raw: str, exit_code: int) -> dict:
    if exit_code != 0 or len(raw) > 1_000_000:
        raise ValueError("演练进程未成功完成")
    value = json.loads(raw)
    if (not isinstance(value, dict) or value.get("fakeData") is not True
            or value.get("scenario") != SCENARIO or value.get("phase") != "REHEARSAL_ENDPOINT"
            or value.get("mismatches") != []):
        raise ValueError("未得到有效的离线演练终点")
    dispatched = value.get("dispatched")
    records = value.get("records")
    if not isinstance(dispatched, list) or not isinstance(records, list):
        raise ValueError("演练证据不完整")
    choices = [d for d in dispatched if isinstance(d, dict) and d.get("kind") == "chooseSlot"]
    refusals = [r for r in records if isinstance(r, dict) and r.get("type") == "refusal"]
    if len(choices) < 2 or not refusals or any(d.get("kind") == "submitOrder" for d in dispatched):
        raise ValueError("拒绝重选或付款前边界未得到证明")
    return {"choices": len(choices), "refusals": len(refusals), "realOrders": 0,
            "message": "离线演练完成：末档被拒绝后重选，已到模拟付款前终点；真实订单 0。"}

class Runner:
    def __init__(self, popen=subprocess.Popen):
        self.popen = popen
        self.lock = threading.Lock()
        self.events = queue.Queue()
        self.generation = 0
        self.busy = False
        self.process = None

    def start(self, mode="offline") -> bool:
        if mode not in ("offline", "public-probe", "existing-chrome"):
            raise ValueError("运行模式未启用")
        with self.lock:
            if self.busy:
                return False
            self.busy = True
            self.generation += 1
            generation = self.generation
        threading.Thread(target=self._run, args=(generation, mode), daemon=True).start()
        return True

    def _run(self, generation: int, mode: str) -> None:
        process = None
        try:
            node = shutil.which("node")
            if not node:
                raise ValueError("本机未找到 Node，尚未运行演练")
            with self.lock:
                if generation != self.generation:
                    return
                factory = ContainedChild if mode != "offline" and self.popen is subprocess.Popen else self.popen
                argv=existing_chrome_command(node) if mode=='existing-chrome' else probe_command(node) if mode=='public-probe' else command(node)
                process = factory(argv, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                self.process = process
            stdout, _ = process.communicate(timeout=110 if mode=='existing-chrome' else 45 if mode == "public-probe" else 20)
            result = classify_existing_chrome(stdout,process.returncode) if mode=='existing-chrome' else classify_probe(stdout, process.returncode) if mode == "public-probe" else classify(stdout, process.returncode)
            self.events.put((generation, "done", result))
        except Exception:
            self.events.put((generation, "error", {"message": "正常 Chrome 连接未确认；先完成本机通道安装与扩展连接，旧任务保持，未执行购买。" if mode=='existing-chrome' else "官网预检未确认完成；未新增购买请求，旧未知任务保持。" if mode == "public-probe" else "演练未确认完成；没有访问官网或创建真实订单。"}))
        finally:
            if isinstance(process, ContainedChild) and process.done.is_set() and not process.cleanup_confirmed:
                self.events.put((generation, "unresolved", {"message": "执行进程清理尚未确认，已阻止再次启动；旧购买记录保持。"}))
                return
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate()
            with self.lock:
                if generation == self.generation:
                    self.busy = False
                    self.process = None

    def stop(self) -> None:
        with self.lock:
            self.generation += 1
            process = self.process
            # Busy stays set until the owned process is confirmed terminal below.
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        with self.lock:
            self.process = None
            self.busy = False

class App:
    def __init__(self, root: tk.Tk, browser_channel='native-chrome'):
        routes={'chrome':'Chrome','msedge':'Edge','native-chrome':'正常 Chrome 结账通道','native-r2':'正常 Chrome 浏览器内执行 R2'}
        if browser_channel not in routes:raise ValueError('Browser choice is not enabled')
        self.root,self.runner,self.checkout=root,Runner(),CheckoutRunner()
        self.checkout_working=False;self.checkout_phase=None;self.checkout_submission_pending=False
        self.checkout_complete=False;self.checkout_receipt=False;self.current_consent=None
        root.title(TITLE);root.geometry('800x640');root.minsize(720,570)
        pane=ttk.Frame(root,padding=18);pane.pack(fill='both',expand=True)
        ttk.Label(pane,text='AppleBuy 自提助手',font=('Microsoft YaHei UI',17)).pack(anchor='w')
        ttk.Label(pane,text='本次方案：Pro 256GB 黑色 · 1 台 · 大连恒隆 · 上限 ¥9,999 · 支付宝',wraplength=730).pack(anchor='w',pady=(8,12))
        self.mode_tabs=ttk.Notebook(pane);self.mode_tabs.pack(fill='both',expand=True)
        main=ttk.Frame(self.mode_tabs,padding=12);advanced=ttk.Frame(self.mode_tabs,padding=12)
        self.mode_tabs.add(main,text='购买');self.mode_tabs.add(advanced,text='高级 / 故障恢复')
        fields=ttk.LabelFrame(main,text='取货资料',padding=10);fields.pack(fill='x')
        self.pickup_values={}
        for i,(key,label) in enumerate([('lastName','姓'),('firstName','名'),('phone','手机号'),('email','邮箱'),('identitySuffix','证件后四位')]):
            row,col=(0,i) if i<3 else (1,i-3)
            cell=ttk.Frame(fields);cell.grid(row=row,column=col,sticky='w',padx=(0,10),pady=4)
            ttk.Label(cell,text=label).pack(side='left');v=tk.StringVar();self.pickup_values[key]=v
            ttk.Entry(cell,textvariable=v,width=10 if key in ('firstName','lastName','identitySuffix') else 22,show='*' if key=='identitySuffix' else '').pack(side='left',padx=(4,0))
        ttk.Label(fields,text='官网已有且有效的信息可留空。资料只用于本次会话，不保存账户密码。',wraplength=690).grid(row=2,column=0,columnspan=3,sticky='w',pady=(5,0))
        state_box=ttk.LabelFrame(main,text='程序进度',padding=12);state_box.pack(fill='both',expand=True,pady=(12,8))
        self.status=tk.StringVar(value='准备就绪。开始后先读取已有任务，避免重复购买。')
        self.result=tk.StringVar(value='结账、门店、末档和支付宝由程序选择；遇到登录或验证时会提示。')
        self.summary_status=tk.StringVar(value='等待开始')
        ttk.Label(state_box,textvariable=self.summary_status,font=('Microsoft YaHei UI',13)).pack(anchor='w',pady=(0,8))
        ttk.Label(state_box,textvariable=self.result,wraplength=680).pack(anchor='w')
        self.consent_text=tk.StringVar(value='');ttk.Label(state_box,textvariable=self.consent_text,wraplength=680).pack(anchor='w',pady=(8,0))
        action_row=ttk.Frame(main);action_row.pack(fill='x',pady=(5,6))
        self.primary_button=ttk.Button(action_row,text='开始 / 继续',command=self.primary_action);self.primary_button.pack(side='left',fill='x',expand=True)
        self.main_pause_button=ttk.Button(action_row,text='暂停',command=self.pause_shortcut,state='disabled');self.main_pause_button.pack(side='left',padx=(10,0))
        ttk.Label(main,text='默认使用正常 Chrome（R1）。购买通道连接后保持打开；最终提交需要接受本次条款。',wraplength=710).pack(anchor='w')
        # Existing guarded controls remain available, but do not crowd the ordinary purchase page.
        ttk.Label(advanced,text='连接、演练和旧任务处理。正常流程无需反复进入这里。',wraplength=710).pack(anchor='w',pady=(0,7))
        browser_controls=ttk.Frame(advanced);browser_controls.pack(anchor='w')
        ttk.Label(browser_controls,text='执行路线：').pack(side='left')
        self.browser_choice=tk.StringVar(value=routes[browser_channel])
        self.browser_picker=ttk.Combobox(browser_controls,textvariable=self.browser_choice,values=tuple(routes.values()),state='readonly',width=28);self.browser_picker.pack(side='left')
        self.keep_session=tk.BooleanVar(value=False)
        self.keep_session_checkbox=tk.Checkbutton(advanced,text='独立 Chrome / Edge：允许在本机保留登录会话',variable=self.keep_session,anchor='w');self.keep_session_checkbox.pack(anchor='w')
        ttk.Label(advanced,text='正常 Chrome 通道保留现有登录；更新或断开后，从 AppleBuy 扩展连接购买通道。R2 保留为可选路线。',wraplength=710).pack(anchor='w',pady=(3,7))
        controls=ttk.Frame(advanced);controls.pack(fill='x')
        self.start_button=ttk.Button(controls,text='离线演练',command=self.start)
        self.probe_button=ttk.Button(controls,text='公开配置预检（不加购）',command=self.probe)
        self.chrome_probe_button=ttk.Button(controls,text='只读查看 Chrome 购物袋',command=self.probe_existing_chrome)
        self.import_button=ttk.Button(controls,text='导入旧任务（只读）',command=self.import_handoff)
        self.stop_button=ttk.Button(controls,text='停止演练',command=self.stop,state='disabled')
        for i,c in enumerate([self.start_button,self.probe_button,self.chrome_probe_button,self.import_button,self.stop_button]):c.grid(row=i//3,column=i%3,sticky='ew',padx=3,pady=3)
        checkout_controls=ttk.Frame(advanced);checkout_controls.pack(fill='x',pady=(6,2))
        self.checkout_button=ttk.Button(checkout_controls,text='连接程序',command=self.open_checkout)
        self.advance_button=ttk.Button(checkout_controls,text='核对并继续当前任务',command=self.advance_checkout,state='disabled')
        self.reconcile_button=ttk.Button(checkout_controls,text='只读核对旧任务',command=self.reconcile_checkout,state='disabled')
        self.transfer_button=ttk.Button(checkout_controls,text='处理已核实的旧购物袋',command=self.transfer_checkout,state='disabled')
        self.checkout_stop_button=ttk.Button(checkout_controls,text='暂停程序',command=self.stop_checkout,state='disabled')
        for i,c in enumerate([self.checkout_button,self.advance_button,self.reconcile_button,self.transfer_button,self.checkout_stop_button]):c.grid(row=i//3,column=i%3,sticky='ew',padx=3,pady=3)
        self.transfer_confirm=tk.BooleanVar(value=False)
        self.transfer_checkbox=tk.Checkbutton(advanced,text='需先核对旧执行停止、同一账户与现有订单，才可处理旧购物袋。',variable=self.transfer_confirm,state='disabled',anchor='w',justify='left',wraplength=700);self.transfer_checkbox.pack(anchor='w',pady=(5,0))
        expiry_entry=ttk.Frame(advanced);expiry_entry.pack(fill='x',pady=3)
        ttk.Label(expiry_entry,text='旧结账入口：').pack(side='left');self.expired_checkout_url=tk.StringVar();ttk.Entry(expiry_entry,textvariable=self.expired_checkout_url).pack(side='left',fill='x',expand=True)
        self.empty_restart_confirm=tk.BooleanVar(value=False)
        self.empty_restart_checkbox=tk.Checkbutton(advanced,text='同一账户、旧执行已停且无待付款同款订单；允许从明确空袋开始这一台，保留全部历史。',variable=self.empty_restart_confirm,state='disabled',anchor='w',justify='left',wraplength=700);self.empty_restart_checkbox.pack(anchor='w',pady=3)
        self.empty_restart_button=ttk.Button(advanced,text='按已确认条件处理空购物袋',command=self.restart_empty_checkout,state='disabled');self.empty_restart_button.pack(anchor='w')
        self.browser_diagnostic=tk.StringVar(value='未记录当前浏览器错误。')
        ttk.Label(advanced,textvariable=self.browser_diagnostic,wraplength=700).pack(anchor='w',pady=(8,0))
        ttk.Label(advanced,textvariable=self.status,wraplength=700).pack(anchor='w',pady=3)
        # Keep legacy consent controls as guarded state holders, not an extra normal-flow click.
        self.final_confirm=tk.BooleanVar(value=False)
        self.final_checkbox=ttk.Checkbutton(advanced,variable=self.final_confirm,state='disabled')
        self.submit_button=ttk.Button(advanced,command=self.submit_checkout,state='disabled')
        root.bind('<Control-Alt-p>',lambda event:self.checkout_shortcut())
        root.bind('<Control-Alt-s>',lambda event:self.pause_shortcut())
        root.bind('<Control-Alt-c>',lambda event:self.probe_existing_chrome())
        self.status.trace_add('write',self.update_window_title);self.update_window_title()
        root.protocol('WM_DELETE_WINDOW',self.close)
        self.timer=root.after(100,self.poll)

    def _enabled(self,name):
        control=getattr(self,name,None)
        if control is None:return False
        return str(control.cget('state'))!='disabled' if hasattr(control,'cget') else control.state!='disabled'

    def refresh_primary(self):
        if not hasattr(self,'primary_button'):return
        busy=self.checkout.busy
        action,label=primary_choice(busy=busy,working=getattr(self,'checkout_working',False) or self.runner.busy,
            readonly=getattr(self,'checkout_readonly',False),paused=getattr(self,'checkout_paused',False),owner_lost=getattr(self,'checkout_owner_lost',False),
            attempted=getattr(self,'checkout_submission_pending',False),complete=getattr(self,'checkout_complete',False),can_open=self._enabled('checkout_button'),
            can_advance=self._enabled('advance_button'),can_reconcile=self._enabled('reconcile_button'),can_submit=self._enabled('submit_button') and self._enabled('final_checkbox'),
            consent_current=current_consent(getattr(self,'current_consent',None)),phase=getattr(self,'checkout_phase',None))
        self.primary_button.config(text=label,state='normal' if action else 'disabled');self.primary_mode=action
        self.main_pause_button.config(state='normal' if busy or self.runner.busy else 'disabled')
        phase=getattr(self,'checkout_phase',None)
        title='等待开始' if not busy else {'AUTH':'等待官网登录 / 验证','BAG':'核对购物袋','FULFILLMENT':'选择到店自提','SLOTS':'选择门店与末档','DETAILS':'填写取货资料','PAYMENT':'选择支付宝','REVIEW':'核对订单','ORDER_RECEIPT':'核对下单回执','ORDER_DETAIL':'核对订单详情'}.get(phase,'读取当前进度')
        if getattr(self,'checkout_owner_lost',False):title='执行权已丢失，已停止'
        elif getattr(self,'checkout_paused',False):title='已暂停'
        elif getattr(self,'checkout_complete',False):title='订单已核对，待付款'
        elif getattr(self,'checkout_receipt',False):title='订单已创建，待付款'
        elif getattr(self,'checkout_submission_pending',False):title='已发出提交，等待核验'
        elif action=='submit':title='已到最后一步，请确认本次条款'
        elif action=='reconcile':title='已有任务，先只读核对'
        self.summary_status.set(title)
        if hasattr(self.root,'title'):self.update_window_title()
        summary=getattr(self,'current_consent',None)
        self.consent_text.set(('本次总计：¥'+format(summary['totalCny'],',')+'。确认唯一一台、无附加项、账户无同款待付款订单，并接受本次条款：'+summary['termsUrl']) if action=='submit' and current_consent(summary) else '')

    def primary_action(self):
        self.refresh_primary();action=getattr(self,'primary_mode',None)
        if action is None:return
        if action=='submit':
            # The button explicitly says it accepts THIS displayed agreement; no auto acceptance.
            if not current_consent(getattr(self,'current_consent',None)):return
            self.final_confirm.set(True)
            self.checkout_working=True;self.primary_button.config(state='disabled');self.submit_checkout()
        elif action=='open':self.open_checkout()
        elif action=='reconcile':self.reconcile_checkout()
        elif action=='advance':self.advance_checkout()
        self.refresh_primary()

    def update_window_title(self,*_):
        # Fixed public status labels only; contact/identity values and arbitrary record text never enter the title.
        message=self.status.get();label='等待操作'
        if '需要导入原任务' in message:label='缺少旧任务，未发购买动作'
        elif '清理' in message and '未确认' in message:label='清理未确认，禁止再次启动'
        elif '已停止' in message:label='已停止，旧记录保留'
        elif '原任务仍有未知' in message:label='旧动作未知，仅可核对'
        elif getattr(self,'checkout_paused',False):label='已暂停，记录保留'
        elif getattr(self,'checkout_receipt',False):label='订单已创建，待付款'
        elif getattr(self,'checkout_submission_pending',False):label='已提交，待核验'
        elif getattr(self,'checkout_working',self.checkout.busy):label='程序执行中'
        self.root.title(TITLE+' · '+label+' [Ctrl+Alt+P 开始；Ctrl+Alt+S 暂停；Ctrl+Alt+C 只读Chrome]')

    def checkout_shortcut(self):
        self.open_checkout();return 'break'

    def pause_shortcut(self):
        if self.checkout.busy:self.stop_checkout()
        else:self.stop()
        return 'break'

    def start(self):
        if self.checkout.busy:return
        if self.runner.start():
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            self.chrome_probe_button.config(state='disabled')
            self.stop_button.config(state="normal")
            self.status.set("正在运行现有离线购买引擎……")
            self.result.set("本次使用虚构数据，真实订单 0。")

    def probe(self):
        if self.checkout.busy:return
        if self.runner.start("public-probe"):
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            self.chrome_probe_button.config(state='disabled')
            self.stop_button.config(state="normal")
            self.status.set("正在由桌面程序核对 Pro 官网公开配置……")
            self.result.set("使用程序自己的临时 Chrome；不读取个人会话，不查看或清空旧购物袋。")

    def probe_existing_chrome(self):
        if self.checkout.busy or self.runner.busy:return
        if self.runner.start('existing-chrome'):
            self.start_button.config(state='disabled');self.probe_button.config(state='disabled');self.chrome_probe_button.config(state='disabled');self.stop_button.config(state='normal')
            self.status.set('正在连接本人已允许的正常 Chrome 通道，仅只读核对购物袋；登录及账户身份尚未核实……')
            self.result.set('不读取或复制 Cookie、不附加个人浏览器调试端口；未连接不会打开购买流程。')

    def import_handoff(self):
        if self.runner.busy or self.checkout.busy:
            self.status.set("当前执行尚未结束，暂不导入。")
            return
        path=filedialog.askopenfilename(title="选择原插件本地导出的任务文件",filetypes=[("任务文件","*.json")])
        if not path:
            return
        try:
            p=subprocess.run([shutil.which("node"),str(ROOT/"src/desktop/import-handoff.mjs"),path],cwd=ROOT,capture_output=True,text=True,encoding="utf-8",timeout=5,creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
            value=json.loads(p.stdout)
            if value.get("imported") is not True:
                raise ValueError("unconfirmed")
            self.status.set("原任务已导入为只读，未知动作和全部历史保留；没有恢复购买。")
            self.result.set("待确认动作："+{"addBag":"加入购物袋","checkout":"结账","chooseSlot":"选择时段","fillDetails":"继续取货资料","selectPayment":"选择支付宝","continuePayment":"检查订单","submitOrder":"提交订单"}.get(value.get("pendingAction"),"其它或无"))
        except Exception:
            self.status.set("原任务导入未确认，旧记录保持；未开始新的购买。")

    def open_checkout(self):
        if self.runner.busy or self.checkout.busy:return
        self.final_confirm.set(False)
        self.checkout_paused=False
        self.checkout_owner_lost=False
        self.checkout_pause_ack=None
        try:
            choice=self.browser_choice.get()
            if choice not in ('Chrome','Edge','正常 Chrome 结账通道','正常 Chrome 浏览器内执行 R2'):raise ValueError('Browser choice is not enabled')
            native=choice in ('正常 Chrome 结账通道','正常 Chrome 浏览器内执行 R2')
            if self.checkout.open(browser_channel='native-r2' if choice=='正常 Chrome 浏览器内执行 R2' else 'native-chrome' if native else 'msedge' if choice=='Edge' else 'chrome',keep_session=False if native else self.keep_session.get()):
                self.browser_diagnostic.set(choice+' 本次尚未记录失败响应；旧会话的错误提示已清除。')
                self.browser_picker.config(state='disabled')
                self.keep_session_checkbox.config(state='disabled')
                self.checkout_begin_pending=True
                self.checkout_working=True
                self.checkout_button.config(state='disabled');self.checkout_stop_button.config(state='normal')
                self.start_button.config(state='disabled');self.probe_button.config(state='disabled');self.chrome_probe_button.config(state='disabled')
                self.status.set('正在读取原任务并打开程序结账；没有原任务或仍未知时不会新建购买。')
                self.result.set('本次尚未核对真实未付款订单；历史演练结果不代表本次官网结果。')
        except Exception:self.checkout_working=False;self.status.set('结账入口未确认，旧记录保持；没有开始新购买。')

    def advance_checkout(self):
        try:
            data={k:v.get() for k,v in self.pickup_values.items() if v.get()}
            if data.get('identitySuffix') and (len(data['identitySuffix'])!=4 or not data['identitySuffix'].isdigit()):
                self.status.set('证件后四位格式不正确；未发动作。');return
            self.advance_button.config(state='disabled');self.submit_button.config(state='disabled');self.final_confirm.set(False)
            action='resume' if getattr(self,'checkout_paused',False) else 'advance'
            self.checkout_paused=False
            self.checkout_working=True
            self.checkout.send({'action':action,'checkoutApproved':True,'newContextConfirmed':True,'privatePickupData':data})
        except Exception:self.checkout_working=False;self.status.set('推进未确认；保留原动作，不自动重复。')

    def reconcile_checkout(self):
        try:
            self.submit_button.config(state='disabled');self.final_confirm.set(False)
            self.checkout_paused=False
            self.checkout_working=True
            self.checkout.send({'action':'reconcile'})
        except Exception:self.checkout_working=False;self.status.set('旧任务核对未确认；没有发出官网购买动作。')

    def transfer_checkout(self):
        if not self.transfer_confirm.get():self.status.set('需确认接替当前同一账户购物袋这一台；未发购买动作。');return
        data={k:v.get() for k,v in self.pickup_values.items() if v.get()}
        if data.get('identitySuffix') and (len(data['identitySuffix'])!=4 or not data['identitySuffix'].isdigit()):
            self.status.set('证件后四位格式不正确；未发动作。');return
        restart_payment=getattr(self,'checkout_can_restart_payment',False)
        expiry_url=self.expired_checkout_url.get().strip() if restart_payment else None
        if restart_payment and not re.fullmatch(r'https://(?:www|secure\d+\.www)\.apple\.com\.cn/shop/checkout',expiry_url):self.status.set('请提供原官网结账入口，不带查询参数；未发动作。');return
        self.transfer_confirm.set(False);self.transfer_button.config(state='disabled');self.final_confirm.set(False);self.final_checkbox.config(state='disabled');self.reconcile_button.config(state='disabled');self.advance_button.config(state='disabled')
        try:
            command={'action':'restart-payment' if restart_payment else 'renew-draft' if getattr(self,'checkout_can_renew_ended',False) else 'transfer','approved':True,'newContextConfirmed':True,'privatePickupData':data}
            if command['action']=='restart-payment':command.update(oldExecutorStopped=True,sameAccountOrdersClear=True,expiredCheckoutUrl=expiry_url,additionalRecoveryApproved=getattr(self,'checkout_can_additional_review',False),automaticRecoveryApproved=getattr(self,'checkout_can_policy_review',False))
            if command['action']=='renew-draft':command.update(merchantExpiryConfirmed=True,oldExecutorStopped=True,sameAccountOrdersClear=True)
            self.checkout_working=True
            self.checkout.send(command)
        except Exception:self.checkout_working=False;self.status.set('接替未确认，旧未知记录保持，不重复加购或下单。')

    def submit_checkout(self):
        if not self.final_confirm.get():self.status.set('需要核对当前订单并接受本次条款；未提交。');return
        self.submit_button.config(state='disabled');self.final_confirm.set(False)
        self.checkout_working=True
        try:self.checkout.send({'action':'submit','termsAccepted':True,'existingOrdersChecked':True,'noExtras':True})
        except Exception:self.checkout_working=False;self.status.set('最终动作未确认，保留记录，不重复提交。')

    def restart_empty_checkout(self):
        if not self.empty_restart_confirm.get() or self.browser_choice.get() not in ('正常 Chrome 结账通道','正常 Chrome 浏览器内执行 R2'):self.status.set('需本人确认当前账户、旧官网结账停止和无已有待付款同款订单；没有新动作。');return
        data={k:v.get() for k,v in self.pickup_values.items() if v.get()}
        if data.get('identitySuffix') and (len(data['identitySuffix'])!=4 or not data['identitySuffix'].isdigit()):self.status.set('证件后四位格式不正确；未发动作。');return
        self.empty_restart_confirm.set(False);self.empty_restart_button.config(state='disabled');self.empty_restart_checkbox.config(state='disabled');self.final_confirm.set(False);self.final_checkbox.config(state='disabled');self.submit_button.config(state='disabled')
        self.checkout_working=True
        try:self.checkout.send({'action':'restart-empty','approved':True,'accountConfirmedByUser':True,'oldCheckoutStoppedByUser':True,'existingOrdersCheckedByUser':True,'privatePickupData':data})
        except Exception:self.checkout_working=False;self.status.set('空购物袋新尝试未确认；旧记录保留，不重复加购或下单。')

    def stop_checkout(self):
        try:self.checkout.pause()
        except Exception:self.checkout_working=False;self.status.set('暂停指令未确认；不重新启动，旧动作保持。');return
        self.checkout_paused=True;self.checkout_pause_ack=None;self.final_confirm.set(False);self.final_checkbox.config(state='disabled')
        self.advance_button.config(state='disabled');self.reconcile_button.config(state='disabled');self.submit_button.config(state='disabled');self.checkout_stop_button.config(state='disabled')
        self.transfer_button.config(state='disabled');self.transfer_checkbox.config(state='disabled');self.transfer_confirm.set(False)
        self.status.set('正在暂停当前任务并核对执行结束；保留官网窗口，已发送动作仍可能完成。')

    def stop(self):
        try:
            self.runner.stop()
        except Exception:
            self.status.set("执行进程清理尚未确认，不能再次启动；旧记录保持。")
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            return
        self.start_button.config(state="normal")
        self.probe_button.config(state="normal")
        self.chrome_probe_button.config(state='normal')
        self.stop_button.config(state="disabled")
        self.status.set("已停止本次执行。旧购买记录保持；已开始的只读浏览器请求可能已完成。")

    def poll(self):
        if self.checkout.busy:self.chrome_probe_button.config(state='disabled')
        try:
            while True:
                v=self.checkout.events.get_nowait()
                if v.get('generation')!=self.checkout.generation:continue
                kind=v.get('type')
                if kind in ('ready','blocked','result','paused','worker-ended','owner-lost'):self.checkout_working=False
                if kind=='network-status':
                    host=v.get('host');code=v.get('status');brand=v.get('browser')
                    if isinstance(host,str) and (host in ('www.apple.com.cn','idmsa.apple.com.cn','appleid.cdn-apple.com') or re.fullmatch(r'secure[0-9]+\.www\.apple\.com\.cn',host)) and type(code) is int and 400<=code<=599 and brand in ('chrome','msedge'):
                        self.browser_diagnostic.set(('Edge' if brand=='msedge' else 'Chrome')+' 官网失败响应：HTTP '+str(code)+' · '+host+'；具体原因仍待核对。')
                    continue
                if kind=='owner-lost':
                    self.checkout_owner_lost=True;self.checkout_pause_ack=None;self.final_confirm.set(False);self.transfer_confirm.set(False)
                    for control in (self.advance_button,self.reconcile_button,self.transfer_button,self.transfer_checkbox,self.submit_button,self.final_checkbox,self.checkout_stop_button,self.chrome_probe_button,self.empty_restart_button,self.empty_restart_checkbox):control.config(state='disabled')
                    self.status.set(v['message']);continue
                if getattr(self,'checkout_owner_lost',False) and kind!='worker-ended':continue
                if kind in ('ready','blocked','result','worker-ended'):
                    self.final_confirm.set(False);self.final_checkbox.config(state='disabled');self.current_consent=None
                if kind=='paused':
                    self.checkout_paused=True;self.current_consent=None;self.checkout_readonly=v.get('readOnly') is True
                    self.checkout_pause_ack={'canContinue':v.get('canContinue') is True,'readOnly':self.checkout_readonly}
                    self.advance_button.config(state='normal' if v.get('canContinue') is True else 'disabled')
                    self.reconcile_button.config(state='normal' if self.checkout_readonly else 'disabled')
                    self.checkout_stop_button.config(state='normal' if self.checkout.busy else 'disabled')
                    if self.checkout_readonly:
                        self.status.set('已暂停并保留当前任务与官网窗口。请点“核对导入的旧任务”只读核对，不恢复购买。')
                    elif v.get('canContinue') is True:
                        self.status.set('已暂停并保留当前任务与官网窗口。点“继续本次 Pro 购买”先核对原结果，不重复已发送动作。')
                    else:
                        self.status.set('已暂停并保留当前任务与官网窗口；当前任务不能继续购买，旧记录保持。')
                    continue
                if kind=='blocked' and (v.get('paused') is True or getattr(self,'checkout_paused',False)):
                    self.checkout_paused=True;self.status.set(v['message']);ack=getattr(self,'checkout_pause_ack',None)
                    self.advance_button.config(state='normal' if ack and ack['canContinue'] and self.checkout.busy else 'disabled')
                    self.reconcile_button.config(state='normal' if ack and ack['readOnly'] and self.checkout.busy else 'disabled')
                    self.checkout_stop_button.config(state='normal' if self.checkout.busy else 'disabled')
                    continue
                if v.get('paused') is True or getattr(self,'checkout_paused',False):
                    if kind!='worker-ended':continue
                if kind=='worker-ended':
                    if self.checkout.terminal():
                        self.keep_session.set(False)
                        self.browser_picker.config(state='readonly')
                        self.keep_session_checkbox.config(state='normal')
                        self.transfer_button.config(state='disabled');self.transfer_checkbox.config(state='disabled');self.transfer_confirm.set(False)
                        self.empty_restart_button.config(state='disabled');self.empty_restart_checkbox.config(state='disabled');self.empty_restart_confirm.set(False)
                        self.checkout_button.config(state='normal');self.start_button.config(state='normal');self.probe_button.config(state='normal');self.chrome_probe_button.config(state='normal')
                        self.advance_button.config(state='disabled');self.reconcile_button.config(state='disabled');self.submit_button.config(state='disabled');self.checkout_stop_button.config(state='disabled')
                    else:self.chrome_probe_button.config(state='disabled');self.status.set('结账清理未确认，禁止再次启动。')
                elif kind=='ready':
                    self.checkout_readonly=v.get('readOnly') is True
                    self.checkout_can_renew_ended=v.get('canRenewEndedDraft') is True
                    self.checkout_can_restart_payment=v.get('canRestartExpiredPayment') is True
                    self.checkout_can_additional_review=v.get('canAdditionalReviewRecovery') is True
                    self.checkout_can_policy_review=v.get('canPolicyReviewRecovery') is True
                    if self.checkout_can_policy_review:
                        self.transfer_checkbox.config(text='按已确认条件恢复未下单的超时结账：旧执行已停、同账户无同款待付款订单；复用这一台，保留原记录和日期，未知下单结果不重提')
                    elif self.checkout_can_additional_review:
                        self.transfer_checkbox.config(text='本人确认本次只追加一次恢复：旧执行已停止、同账户无同款待付款订单；保留原记录和日期限制，仅复用这一台')
                    elif self.checkout_can_restart_payment:
                        self.transfer_checkbox.config(text='本人确认旧执行已停止，同一账户没有同款待付款订单，购物袋只有这一台；程序先核对官网超时，保留全部记录与原日期限制再继续')
                    elif self.checkout_can_renew_ended:
                        self.transfer_checkbox.config(text='本人核实官网已提示旧结账超时、旧执行已停止，同一账户没有同款待付款订单且购物袋只有这一台；保留全部旧记录，重新验证本次结账')
                    else:
                        self.transfer_checkbox.config(text='本人确认旧结账已停止、旧时段窗口已到期，当前同一账户购物袋为这一台 Pro；不再加购。暂停保留当前窗口；关闭或重启后只能只读核对')
                    self.status.set(v['message']);self.advance_button.config(state='disabled' if v.get('readOnly') is True else 'normal');self.reconcile_button.config(state='normal' if v.get('readOnly') is True else 'disabled')
                    self.transfer_button.config(state='normal' if v.get('readOnly') is True else 'disabled');self.transfer_checkbox.config(state='normal' if v.get('readOnly') is True else 'disabled')
                    native=getattr(self,'browser_choice',None);empty_ready=v.get('readOnly') is True and native and native.get() in ('正常 Chrome 结账通道','正常 Chrome 浏览器内执行 R2')
                    self.empty_restart_button.config(state='normal' if empty_ready else 'disabled');self.empty_restart_checkbox.config(state='normal' if empty_ready else 'disabled');self.empty_restart_confirm.set(False)
                    if getattr(self,'checkout_begin_pending',False):
                        self.checkout_begin_pending=False
                        if v.get('readOnly') is True:self.reconcile_checkout()
                        else:self.advance_checkout()
                elif kind=='blocked':self.status.set(v['message']);self.advance_button.config(state='normal' if self.checkout.busy and not getattr(self,'checkout_readonly',False) else 'disabled');self.submit_button.config(state='disabled')
                elif kind in ('progress','result'):
                    if v.get('paused') is False:self.checkout_paused=False;self.checkout_stop_button.config(state='normal' if self.checkout.busy else 'disabled')
                    if isinstance(v.get('readOnly'),bool):self.checkout_readonly=v['readOnly']
                    phase=v.get('phase','UNKNOWN')
                    self.checkout_phase=phase
                    if v.get('pendingAction')=='submitOrder':self.checkout_submission_pending=True
                    if v.get('state')=='RUNNING':self.checkout_working=True
                    if phase!='REVIEW' or v.get('pendingAction') is not None:
                        self.current_consent=None;self.final_confirm.set(False);self.submit_button.config(state='disabled');self.final_checkbox.config(state='disabled')
                    if phase=='AUTH':self.result.set('请在 Chrome 完成登录或验证，程序会自动衔接。' if not getattr(self,'checkout_submission_pending',False) else '请在 Chrome 登录后核对已提交的订单，不会重新下单。')
                    name={'AUTH':'等待本人登录/验证','SLOTS':'选择末档','DETAILS':'取货资料','PAYMENT':'付款方式','REVIEW':'核对订单','ORDER_DETAIL':'核对未付款订单'}.get(phase,phase)
                    self.status.set('程序结账：'+name+'；'+v.get('state','NEEDS_VERIFICATION'))
                    review_labels={'trace-missing':'本次流程记录缺失','document-changed':'页面已更换','interaction-detected':'检测到流程外操作','payment-step-unconfirmed':'付款方式衔接未确认','final-already-sent':'已记录提交','review-root':'复核页面结构','item':'商品规格','quantity':'数量','unexpected-store-or-fulfillment':'配送信息结构','amount':'金额','unexpected-slot':'时段信息结构','extras':'附加项目','payment-method':'支付宝识别','terms':'当前条款识别','pickup-notice':'取货提示','store-edit':'门店入口','dialog':'弹窗','task-proof':'任务与当前页面绑定'}
                    review_codes=v.get('reviewDiagnostic')
                    if phase=='REVIEW' and isinstance(review_codes,list) and 0<len(review_codes)<=len(review_labels) and all(isinstance(c,str) and c in review_labels for c in review_codes):
                        self.result.set('复核未通过：'+'、'.join(review_labels[c] for c in review_codes)+'。已停止，未提交订单；需修复后继续。')
                    if v.get('readOnly') is True:
                        self.result.set('当前只核对保留任务；重启后不能自动核对最终订单，请本人到官网订单页核对。旧确认不代表当前订单结果，程序不重新下单。')
                    if kind=='result':
                        self.checkout_receipt=v.get('receiptAwaitingPayment') is True and phase=='ORDER_RECEIPT' and v.get('pendingAction')=='submitOrder' and v.get('readOnly') is not True
                        self.checkout_complete=v.get('realOrderVerified') is True
                        if self.checkout_receipt or self.checkout_complete:self.checkout_submission_pending=True
                        self.checkout_readonly=v.get('readOnly') is True
                        self.reconcile_button.config(state='normal' if self.checkout_readonly else 'disabled')
                        self.transfer_button.config(state='normal' if self.checkout_readonly else 'disabled');self.transfer_checkbox.config(state='normal' if self.checkout_readonly else 'disabled')
                        native=getattr(self,'browser_choice',None);empty_ready=self.checkout_readonly and native and native.get() in ('正常 Chrome 结账通道','正常 Chrome 浏览器内执行 R2')
                        self.empty_restart_button.config(state='normal' if empty_ready else 'disabled');self.empty_restart_checkbox.config(state='normal' if empty_ready else 'disabled');self.empty_restart_confirm.set(False)
                        self.advance_button.config(state='normal' if v.get('realOrderVerified') is not True and v.get('readOnly') is not True else 'disabled')
                        self.submit_button.config(state='normal' if v.get('reviewReady') is True and v.get('realOrderVerified') is not True else 'disabled')
                        self.final_checkbox.config(state='normal' if v.get('reviewReady') is True and v.get('realOrderVerified') is not True else 'disabled')
                        if v.get('reviewReady') is True and phase=='REVIEW' and v.get('pendingAction') is None and v.get('readOnly') is not True:
                            self.checkout_submission_pending=False
                            self.result.set('程序已到订单复核页。请核对本次方案与条款，再点击下方提交按钮；本次尚未下单。')
                            consent=v.get('consentSummary') or {};self.current_consent=consent if current_consent(consent) else None;choice=consent.get('sourceChoice')
                            if isinstance(choice,dict) and choice.get('store')=='Apple 大连恒隆广场' and consent.get('pickupNotice')=='取货日期待付款完成后确定。':
                                self.result.set('复核页已核对商品、数量、金额和支付宝。门店和时段来自本次程序之前的选择：Apple 大连恒隆广场，'+str(choice.get('date',''))+' '+str(choice.get('start',''))+'–'+str(choice.get('end',''))+'。官网复核页未再次显示门店和时段；取货日期待付款完成后确定，未承诺名额保留。当前条款：'+str(consent.get('termsUrl','')))
                        if getattr(self,'checkout_submission_pending',False) and not self.checkout_receipt and not self.checkout_complete and phase!='AUTH':self.result.set('已保留提交记录，当前订单详情仍待核验；这里只会查询，不会再次下单。')
                        if self.checkout_receipt:self.result.set('官网回执已确认订单创建并等待付款；详情核验尚未完成。请勿重复下单，支付由你本人决定。')
                        if v.get('realOrderVerified') is True:self.result.set('已由程序另行核对同一张未付款订单；未支付，不再下单。')
        except queue.Empty:pass
        try:
            while True:
                generation, kind, value = self.runner.events.get_nowait()
                if generation != self.runner.generation:
                    continue
                self.status.set(value["message"])
                if kind == "unresolved":
                    self.start_button.config(state="disabled")
                    self.probe_button.config(state="disabled")
                    self.chrome_probe_button.config(state='disabled')
                    continue
                if kind == "done" and not value.get("publicProbe") and not value.get('existingChromeProbe'):
                    self.result.set(f"自动选择 {value['choices']} 次；明确拒绝 {value['refusals']} 次；模拟付款前终点；真实订单 0。")
                self.start_button.config(state="normal")
                self.probe_button.config(state="normal")
                self.chrome_probe_button.config(state='normal')
                self.stop_button.config(state="disabled")
        except queue.Empty:
            pass
        self.refresh_primary()
        self.timer = self.root.after(100, self.poll)

    def close(self):
        try:
            self.checkout.stop()
            self.runner.stop()
        except Exception:
            self.status.set("执行进程清理尚未确认；窗口保持，不能再次启动。")
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            return
        self.root.after_cancel(self.timer)
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
