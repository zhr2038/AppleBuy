"""Prepared distinct checkout stdio host. Pinning/own pipe only; never profiles or authentication inputs."""
from pathlib import Path
from multiprocessing.connection import Client
import base64,json,os,queue,sys,threading,time,re
from chrome_native_protocol import extension_origin,read_frame,write_frame,decode
ROOT=Path(__file__).resolve().parents[2]
NAME='com.applebuy.checkout';PREFIX=r'\\.\pipe\applebuy-checkout-'
def valid_context(value):return isinstance(value,str) and re.fullmatch(r'[a-zA-Z0-9-]{16,80}',value)
def valid_pipe(value):return isinstance(value,str) and value.startswith(PREFIX) and re.fullmatch(r'[0-9a-f]{32}',value[len(PREFIX):])
def main():
    if os.name!='nt':return 2
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(),os.O_BINARY);msvcrt.setmode(sys.stdout.fileno(),os.O_BINARY)
    try:
        config=json.loads((ROOT/'.local/desktop/checkout-native-config.json').read_text(encoding='utf8'))
        if config.get('hostName')!=NAME or len(sys.argv)<2 or sys.argv[1]!=extension_origin(config.get('extensionId')):return 2
    except Exception:return 2
    stopped=threading.Event();incoming=queue.Queue(maxsize=8)
    def receive():
        try:
            while not stopped.is_set():
                value=read_frame(sys.stdin.buffer)
                if value is None:break
                incoming.put_nowait(value)
        except Exception:pass
        finally:stopped.set()
    threading.Thread(target=receive,daemon=True).start();seen=set()
    while not stopped.is_set():
        conn=None
        try:
            ticket=json.loads((ROOT/'.local/desktop/checkout-native-ticket.json').read_text(encoding='utf8'))
            if ticket.get('schema')!='applebuy-checkout-ticket/v1' or ticket.get('extensionId')!=config['extensionId'] or not valid_context(ticket.get('contextId')) or ticket['contextId'] in seen or not time.time()<ticket.get('expiresAt',0)<=time.time()+120 or not valid_pipe(ticket.get('pipe')):raise ValueError()
            key=base64.b64decode(ticket['key'],validate=True)
            if len(key)!=32:raise ValueError()
            conn=Client(ticket['pipe'],family='AF_PIPE',authkey=key);seen.add(ticket['contextId'])
            while not stopped.is_set():
                if not conn.poll(.2):continue
                request=decode(conn.recv_bytes(64000))
                if request.get('schema')!='applebuy-native-checkout/v1' or request.get('contextId')!=ticket['contextId'] or request.get('kind')!='request':raise ValueError()
                write_frame(sys.stdout.buffer,request);deadline=time.monotonic()+15;reply=None
                while time.monotonic()<deadline and not stopped.is_set():
                    try:v=incoming.get(timeout=.2)
                    except queue.Empty:continue
                    if v.get('schema')==request['schema'] and v.get('contextId')==request['contextId'] and v.get('id')==request.get('id') and v.get('kind')=='reply':reply=v;break
                if reply is None:raise ValueError()
                conn.send_bytes(json.dumps(reply).encode('utf8'))
                if request.get('operation')=='closeSession':break
        except Exception:stopped.wait(.3)
        finally:
            if conn:conn.close()
        if len(seen)>32:break
    return 0
if __name__=='__main__':sys.exit(main())
