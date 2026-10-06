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
SCENARIO = "last-slot-three-dates"
TITLE = "AppleBuy 桌面助手 · Pro 结账候选"

def command(node: str) -> list[str]:
    return [node, str(ROOT / "src" / "cli.ts"), "rehearse", "--scenario", SCENARIO, "--json"]

def probe_command(node: str) -> list[str]:
    return [node, str(ROOT / "src" / "desktop" / "public-probe.mjs")]

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
        if mode not in ("offline", "public-probe"):
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
                factory = ContainedChild if mode == "public-probe" and self.popen is subprocess.Popen else self.popen
                process = factory(probe_command(node) if mode == "public-probe" else command(node), cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                self.process = process
            stdout, _ = process.communicate(timeout=45 if mode == "public-probe" else 20)
            result = classify_probe(stdout, process.returncode) if mode == "public-probe" else classify(stdout, process.returncode)
            self.events.put((generation, "done", result))
        except Exception:
            self.events.put((generation, "error", {"message": "官网预检未确认完成；未新增购买请求，旧未知任务保持。" if mode == "public-probe" else "演练未确认完成；没有访问官网或创建真实订单。"}))
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
    def __init__(self, root: tk.Tk, browser_channel='chrome'):
        if browser_channel not in ('chrome','msedge'):raise ValueError('Browser choice is not enabled')
        self.root, self.runner = root, Runner()
        self.checkout=CheckoutRunner()
        root.title(TITLE)
        root.geometry("980x670")
        root.minsize(620, 330)
        pane = ttk.Frame(root, padding=20)
        pane.pack(fill="both", expand=True)
        ttk.Label(pane, text="AppleBuy 桌面助手", font=("Microsoft YaHei UI", 17)).pack(anchor="w")
        ttk.Label(pane, text="先跑通一台 Pro 到未付款订单。程序读取保留的原任务；旧未知动作不会自动重试。", wraplength=700).pack(anchor="w", pady=(12, 5))
        ttk.Label(pane, text="实际购买目标：Pro 256GB 黑色 · 1台 · 大连恒隆 · 上限 ¥9,999 · 支付宝", wraplength=620).pack(anchor="w")
        ttk.Label(pane, text="离线按钮使用虚构数据；公开预检止于加购前；程序结账按上方真实条件推进。", wraplength=620).pack(anchor="w", pady=(8, 12))
        controls = ttk.Frame(pane)
        controls.pack(anchor="w")
        self.start_button = ttk.Button(controls, text="运行末档拒绝重选演练", command=self.start)
        self.start_button.pack(side="left")
        self.probe_button = ttk.Button(controls, text="核对官网 Pro（不加购）", command=self.probe)
        self.probe_button.pack(side="left", padx=6)
        self.import_button=ttk.Button(controls,text="导入原任务（仅核对）",command=self.import_handoff)
        self.import_button.pack(side="left",padx=6)
        self.stop_button = ttk.Button(controls, text="停止演练", command=self.stop, state="disabled")
        self.stop_button.pack(side="left", padx=10)
        browser_controls=ttk.Frame(pane);browser_controls.pack(anchor='w',pady=(7,0))
        ttk.Label(browser_controls,text='程序浏览器：').pack(side='left')
        self.browser_choice=tk.StringVar(value='Edge' if browser_channel=='msedge' else 'Chrome')
        self.browser_picker=ttk.Combobox(browser_controls,textvariable=self.browser_choice,values=('Chrome','Edge'),state='readonly',width=10);self.browser_picker.pack(side='left')
        self.keep_session=tk.BooleanVar(value=False)
        self.keep_session_checkbox=ttk.Checkbutton(browser_controls,text='本人同意在本程序独立目录保留登录会话（本机）',variable=self.keep_session);self.keep_session_checkbox.pack(side='left',padx=12)
        self.browser_diagnostic=tk.StringVar(value='尚未记录失败响应；只显示域名和状态码，不读取请求内容。')
        ttk.Label(pane,textvariable=self.browser_diagnostic,wraplength=850).pack(anchor='w',pady=(3,0))
        checkout_controls=ttk.Frame(pane);checkout_controls.pack(anchor="w",pady=(12,4))
        self.checkout_button=ttk.Button(checkout_controls,text="开始 Pro 程序购买",command=self.open_checkout);self.checkout_button.pack(side="left")
        self.advance_button=ttk.Button(checkout_controls,text="继续本次 Pro 购买",command=self.advance_checkout,state="disabled");self.advance_button.pack(side="left",padx=6)
        self.reconcile_button=ttk.Button(checkout_controls,text="核对导入的旧任务",command=self.reconcile_checkout,state="disabled");self.reconcile_button.pack(side="left",padx=6)
        self.transfer_button=ttk.Button(checkout_controls,text="接替当前购物袋这一台",command=self.transfer_checkout,state="disabled");self.transfer_button.pack(side="left",padx=6)
        self.checkout_stop_button=ttk.Button(checkout_controls,text="暂停程序结账",command=self.stop_checkout,state="disabled");self.checkout_stop_button.pack(side="left",padx=6)
        private_fields=ttk.Frame(pane);private_fields.pack(anchor="w",pady=(8,0));self.pickup_values={}
        for key,label in [('lastName','姓'),('firstName','名'),('phone','手机号'),('email','邮箱'),('identitySuffix','证件后四位')]:
            ttk.Label(private_fields,text=label).pack(side="left");v=tk.StringVar();self.pickup_values[key]=v
            ttk.Entry(private_fields,textvariable=v,width=10 if key in ('firstName','lastName','identitySuffix') else 18,show='*' if key=='identitySuffix' else '').pack(side="left",padx=(2,6))
        ttk.Label(pane,text="取货资料仅用于本次程序会话。官网登录或验证请在程序打开的浏览器中完成。",wraplength=850).pack(anchor="w",pady=(5,0))
        self.transfer_confirm=tk.BooleanVar(value=False)
        self.transfer_checkbox=ttk.Checkbutton(pane,text="本人确认旧结账已停止、旧时段窗口已到期，当前同一账户购物袋为这一台 Pro；不再加购。暂停保留当前窗口；关闭或重启后只能只读核对",variable=self.transfer_confirm,state='disabled');self.transfer_checkbox.pack(anchor='w',pady=(6,0))
        self.final_confirm=tk.BooleanVar(value=False)
        self.final_checkbox=ttk.Checkbutton(pane,text="本人核对当前唯一一台、无附加项及无重复订单，接受本次官网条款；只创建未付款订单",variable=self.final_confirm,state='disabled');self.final_checkbox.pack(anchor="w",pady=(8,0))
        self.submit_button=ttk.Button(pane,text="按当前条款创建这一张未付款订单",command=self.submit_checkout,state="disabled");self.submit_button.pack(anchor="w",pady=(4,0))
        self.status = tk.StringVar(value="等待演练。官网那次加购仍未确认，旧任务记录保持。")
        ttk.Label(pane, textvariable=self.status, wraplength=620).pack(anchor="w", pady=(20, 8))
        self.result = tk.StringVar(value="尚未核实新的未付款订单；只读取本机已交接的任务记录，不读取个人浏览器存储。")
        ttk.Label(pane, textvariable=self.result, wraplength=620).pack(anchor="w")
        ttk.Label(pane,text="快捷键：Ctrl+Alt+P 开始 Pro；Ctrl+Alt+S 暂停。最终下单仍需本次条款确认。",wraplength=850).pack(anchor="w",pady=(6,0))
        root.bind('<Control-Alt-p>',lambda event:self.checkout_shortcut())
        root.bind('<Control-Alt-s>',lambda event:self.pause_shortcut())
        self.status.trace_add('write',self.update_window_title)
        self.update_window_title()
        root.protocol("WM_DELETE_WINDOW", self.close)
        self.timer = root.after(100, self.poll)

    def update_window_title(self,*_):
        # Fixed public status labels only; contact/identity values and arbitrary record text never enter the title.
        message=self.status.get();label='等待操作'
        if '需要导入原任务' in message:label='缺少旧任务，未发购买动作'
        elif '清理' in message and '未确认' in message:label='清理未确认，禁止再次启动'
        elif '已停止' in message:label='已停止，旧记录保留'
        elif '原任务仍有未知' in message:label='旧动作未知，仅可核对'
        elif self.checkout.busy:label='程序执行中'
        self.root.title(TITLE+' · '+label+' [Ctrl+Alt+P 开始；Ctrl+Alt+S 暂停]')

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
            self.stop_button.config(state="normal")
            self.status.set("正在运行现有离线购买引擎……")
            self.result.set("本次使用虚构数据，真实订单 0。")

    def probe(self):
        if self.checkout.busy:return
        if self.runner.start("public-probe"):
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            self.stop_button.config(state="normal")
            self.status.set("正在由桌面程序核对 Pro 官网公开配置……")
            self.result.set("使用程序自己的临时 Chrome；不读取个人会话，不查看或清空旧购物袋。")

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
            self.result.set("待确认动作："+{"addBag":"加入购物袋","chooseSlot":"选择时段","submitOrder":"提交订单"}.get(value.get("pendingAction"),"其它或无"))
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
            if choice not in ('Chrome','Edge'):raise ValueError('Browser choice is not enabled')
            if self.checkout.open(browser_channel='msedge' if choice=='Edge' else 'chrome',keep_session=self.keep_session.get()):
                self.browser_picker.config(state='disabled')
                self.keep_session_checkbox.config(state='disabled')
                self.checkout_begin_pending=True
                self.checkout_button.config(state='disabled');self.checkout_stop_button.config(state='normal')
                self.start_button.config(state='disabled');self.probe_button.config(state='disabled')
                self.status.set('正在读取原任务并打开程序结账；没有原任务或仍未知时不会新建购买。')
                self.result.set('本次尚未核对真实未付款订单；历史演练结果不代表本次官网结果。')
        except Exception:self.status.set('结账入口未确认，旧记录保持；没有开始新购买。')

    def advance_checkout(self):
        try:
            data={k:v.get() for k,v in self.pickup_values.items() if v.get()}
            if data.get('identitySuffix') and (len(data['identitySuffix'])!=4 or not data['identitySuffix'].isdigit()):
                self.status.set('证件后四位格式不正确；未发动作。');return
            self.advance_button.config(state='disabled');self.submit_button.config(state='disabled');self.final_confirm.set(False)
            action='resume' if getattr(self,'checkout_paused',False) else 'advance'
            self.checkout_paused=False
            self.checkout.send({'action':action,'checkoutApproved':True,'newContextConfirmed':True,'privatePickupData':data})
        except Exception:self.status.set('推进未确认；保留原动作，不自动重复。')

    def reconcile_checkout(self):
        try:
            self.submit_button.config(state='disabled');self.final_confirm.set(False)
            self.checkout_paused=False
            self.checkout.send({'action':'reconcile'})
        except Exception:self.status.set('旧任务核对未确认；没有发出官网购买动作。')

    def transfer_checkout(self):
        if not self.transfer_confirm.get():self.status.set('需确认接替当前同一账户购物袋这一台；未发购买动作。');return
        data={k:v.get() for k,v in self.pickup_values.items() if v.get()}
        if data.get('identitySuffix') and (len(data['identitySuffix'])!=4 or not data['identitySuffix'].isdigit()):
            self.status.set('证件后四位格式不正确；未发动作。');return
        self.transfer_confirm.set(False);self.transfer_button.config(state='disabled');self.final_confirm.set(False);self.final_checkbox.config(state='disabled');self.reconcile_button.config(state='disabled');self.advance_button.config(state='disabled')
        try:self.checkout.send({'action':'transfer','approved':True,'newContextConfirmed':True,'privatePickupData':data})
        except Exception:self.status.set('接替未确认，旧未知记录保持，不重复加购或下单。')

    def submit_checkout(self):
        if not self.final_confirm.get():self.status.set('需要核对当前订单并接受本次条款；未提交。');return
        self.submit_button.config(state='disabled');self.final_confirm.set(False)
        try:self.checkout.send({'action':'submit','termsAccepted':True,'existingOrdersChecked':True,'noExtras':True})
        except Exception:self.status.set('最终动作未确认，保留记录，不重复提交。')

    def stop_checkout(self):
        try:self.checkout.pause()
        except Exception:self.status.set('暂停指令未确认；不重新启动，旧动作保持。');return
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
        self.stop_button.config(state="disabled")
        self.status.set("已停止本次执行。旧购买记录保持；已开始的只读浏览器请求可能已完成。")

    def poll(self):
        try:
            while True:
                v=self.checkout.events.get_nowait()
                if v.get('generation')!=self.checkout.generation:continue
                kind=v.get('type')
                if kind=='network-status':
                    host=v.get('host');code=v.get('status');brand=v.get('browser')
                    if isinstance(host,str) and (host in ('www.apple.com.cn','idmsa.apple.com.cn','appleid.cdn-apple.com') or re.fullmatch(r'secure[0-9]+\.www\.apple\.com\.cn',host)) and type(code) is int and 400<=code<=599 and brand in ('chrome','msedge'):
                        self.browser_diagnostic.set(('Edge' if brand=='msedge' else 'Chrome')+' 官网失败响应：HTTP '+str(code)+' · '+host+'；具体原因仍待核对。')
                    continue
                if kind=='owner-lost':
                    self.checkout_owner_lost=True;self.checkout_pause_ack=None;self.final_confirm.set(False);self.transfer_confirm.set(False)
                    for control in (self.advance_button,self.reconcile_button,self.transfer_button,self.transfer_checkbox,self.submit_button,self.final_checkbox,self.checkout_stop_button):control.config(state='disabled')
                    self.status.set(v['message']);continue
                if getattr(self,'checkout_owner_lost',False) and kind!='worker-ended':continue
                if kind in ('ready','blocked','result','worker-ended'):
                    self.final_confirm.set(False);self.final_checkbox.config(state='disabled')
                if kind=='paused':
                    self.checkout_paused=True;self.checkout_readonly=v.get('readOnly') is True
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
                        self.browser_picker.config(state='readonly')
                        self.keep_session_checkbox.config(state='normal')
                        self.transfer_button.config(state='disabled');self.transfer_checkbox.config(state='disabled');self.transfer_confirm.set(False)
                        self.checkout_button.config(state='normal');self.start_button.config(state='normal');self.probe_button.config(state='normal')
                        self.advance_button.config(state='disabled');self.reconcile_button.config(state='disabled');self.submit_button.config(state='disabled');self.checkout_stop_button.config(state='disabled')
                    else:self.status.set('结账清理未确认，禁止再次启动。')
                elif kind=='ready':
                    self.checkout_readonly=v.get('readOnly') is True
                    self.status.set(v['message']);self.advance_button.config(state='disabled' if v.get('readOnly') is True else 'normal');self.reconcile_button.config(state='normal' if v.get('readOnly') is True else 'disabled')
                    self.transfer_button.config(state='normal' if v.get('readOnly') is True else 'disabled');self.transfer_checkbox.config(state='normal' if v.get('readOnly') is True else 'disabled')
                    if getattr(self,'checkout_begin_pending',False):
                        self.checkout_begin_pending=False
                        if v.get('readOnly') is True:self.reconcile_checkout()
                        else:self.advance_checkout()
                elif kind=='blocked':self.status.set(v['message']);self.advance_button.config(state='normal' if self.checkout.busy and not getattr(self,'checkout_readonly',False) else 'disabled');self.submit_button.config(state='disabled')
                elif kind in ('progress','result'):
                    if v.get('paused') is False:self.checkout_paused=False;self.checkout_stop_button.config(state='normal' if self.checkout.busy else 'disabled')
                    if isinstance(v.get('readOnly'),bool):self.checkout_readonly=v['readOnly']
                    phase=v.get('phase','UNKNOWN');name={'AUTH':'等待本人登录/验证','SLOTS':'选择末档','DETAILS':'取货资料','PAYMENT':'付款方式','REVIEW':'核对订单','ORDER_DETAIL':'核对未付款订单'}.get(phase,phase)
                    self.status.set('程序结账：'+name+'；'+v.get('state','NEEDS_VERIFICATION'))
                    if v.get('readOnly') is True:
                        self.result.set('当前只核对保留任务；重启后不能自动核对最终订单，请本人到官网订单页核对。旧确认不代表当前订单结果，程序不重新下单。')
                    if kind=='result':
                        self.checkout_readonly=v.get('readOnly') is True
                        self.reconcile_button.config(state='normal' if self.checkout_readonly else 'disabled')
                        self.transfer_button.config(state='normal' if self.checkout_readonly else 'disabled');self.transfer_checkbox.config(state='normal' if self.checkout_readonly else 'disabled')
                        self.advance_button.config(state='normal' if v.get('realOrderVerified') is not True and v.get('readOnly') is not True else 'disabled')
                        self.submit_button.config(state='normal' if v.get('reviewReady') is True and v.get('realOrderVerified') is not True else 'disabled')
                        self.final_checkbox.config(state='normal' if v.get('reviewReady') is True and v.get('realOrderVerified') is not True else 'disabled')
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
                    continue
                if kind == "done" and not value.get("publicProbe"):
                    self.result.set(f"自动选择 {value['choices']} 次；明确拒绝 {value['refusals']} 次；模拟付款前终点；真实订单 0。")
                self.start_button.config(state="normal")
                self.probe_button.config(state="normal")
                self.stop_button.config(state="disabled")
        except queue.Empty:
            pass
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
