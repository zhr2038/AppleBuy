"""Native offline entry. Executes the existing network-guarded engine; no browser/session access."""
from __future__ import annotations
import json
import os
from pathlib import Path
import queue
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
SCENARIO = "last-slot-three-dates"
TITLE = "AppleBuy 桌面助手 · 离线测试候选"

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
            self.process = None
            # Busy stays set until the owned process is confirmed terminal below.
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        with self.lock:
            self.busy = False

class App:
    def __init__(self, root: tk.Tk):
        self.root, self.runner = root, Runner()
        root.title(TITLE)
        root.geometry("900x440")
        root.minsize(620, 330)
        pane = ttk.Frame(root, padding=20)
        pane.pack(fill="both", expand=True)
        ttk.Label(pane, text="AppleBuy 桌面助手", font=("Microsoft YaHei UI", 17)).pack(anchor="w")
        ttk.Label(pane, text="离线演练 / 官网公开配置预检；当前均止于加购前，不预占时段或下单。", wraplength=700).pack(anchor="w", pady=(12, 5))
        ttk.Label(pane, text="实际购买目标：Pro 256GB 黑色 · 1台 · 大连恒隆 · 上限 ¥9,999 · 支付宝", wraplength=620).pack(anchor="w")
        ttk.Label(pane, text="本次测试使用虚构商品、门店、日期；验证每天末档、明确拒绝后的新列表重选。", wraplength=620).pack(anchor="w", pady=(8, 12))
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
        ttk.Button(controls, text="真实购买尚未启用", state="disabled").pack(side="left")
        self.status = tk.StringVar(value="等待演练。官网那次加购仍未确认，旧任务记录保持。")
        ttk.Label(pane, textvariable=self.status, wraplength=620).pack(anchor="w", pady=(20, 8))
        self.result = tk.StringVar(value="尚未运行；此窗口不会读取或更改旧 Chrome 任务。")
        ttk.Label(pane, textvariable=self.result, wraplength=620).pack(anchor="w")
        root.protocol("WM_DELETE_WINDOW", self.close)
        self.timer = root.after(100, self.poll)

    def start(self):
        if self.runner.start():
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            self.stop_button.config(state="normal")
            self.status.set("正在运行现有离线购买引擎……")
            self.result.set("本次使用虚构数据，真实订单 0。")

    def probe(self):
        if self.runner.start("public-probe"):
            self.start_button.config(state="disabled")
            self.probe_button.config(state="disabled")
            self.stop_button.config(state="normal")
            self.status.set("正在由桌面程序核对 Pro 官网公开配置……")
            self.result.set("使用程序自己的临时 Chrome；不读取个人会话，不查看或清空旧购物袋。")

    def import_handoff(self):
        if self.runner.busy:
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

    def stop(self):
        self.runner.stop()
        self.start_button.config(state="normal")
        self.probe_button.config(state="normal")
        self.stop_button.config(state="disabled")
        self.status.set("已停止本次执行。旧购买记录保持；已开始的只读浏览器请求可能已完成。")

    def poll(self):
        try:
            while True:
                generation, kind, value = self.runner.events.get_nowait()
                if generation != self.runner.generation:
                    continue
                self.status.set(value["message"])
                if kind == "done" and not value.get("publicProbe"):
                    self.result.set(f"自动选择 {value['choices']} 次；明确拒绝 {value['refusals']} 次；模拟付款前终点；真实订单 0。")
                self.start_button.config(state="normal")
                self.probe_button.config(state="normal")
                self.stop_button.config(state="disabled")
        except queue.Empty:
            pass
        self.timer = self.root.after(100, self.poll)

    def close(self):
        self.root.after_cancel(self.timer)
        self.runner.stop()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
