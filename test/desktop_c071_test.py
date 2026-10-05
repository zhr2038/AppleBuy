import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("desktop_app71", ROOT / "src/desktop/app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

class DesktopProbeTests(unittest.TestCase):
    def test_current_public_only_result_is_truthfully_classified(self):
        result={"type":"result","scope":"public-before-add","state":"VALIDATED","quoteCny":9999,"skuPath":"/shop/buy-iphone/iphone-18-pro/mjt74ch/a","addSent":False,"personalProfileUsed":False,"browserClosed":True}
        self.assertTrue(app.classify_probe(json.dumps(result),0)["publicProbe"])
        self.assertIn("未确认",app.classify_probe(json.dumps({**result,"state":"UNKNOWN"}),0)["message"])
        for delta in [{"addSent":True},{"personalProfileUsed":True},{"browserClosed":False}]:
            with self.assertRaises(ValueError):app.classify_probe(json.dumps({**result,**delta}),0)

    def test_owned_tree_stop_terminates_child_and_descendant(self):
        child=app.ContainedChild(["node","-e","require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});console.log('FAKE-owned-child-ready');setInterval(()=>{},1000)"],cwd=ROOT)
        result=[]
        t=threading.Thread(target=lambda:result.append(child.communicate(timeout=10)))
        t.start();child.terminate();child.wait(timeout=5);t.join(5)
        self.assertFalse(t.is_alive());self.assertIsNotNone(child.poll());self.assertTrue(child.done.is_set());self.assertTrue(json.loads(child.receipt.read_text())["cleanupConfirmed"])

if __name__ == "__main__": unittest.main()
