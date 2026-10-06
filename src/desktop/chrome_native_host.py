"""Chrome launches this pinned-origin host; it never reads Chrome profiles or authentication data."""
from pathlib import Path
from multiprocessing.connection import Client
import base64
import json
import os
import queue
import re
import sys
import threading
import time
from chrome_native_protocol import HOST_NAME,extension_origin,read_frame,write_frame,decode,probe_request,probe_result,valid_pipe
ROOT=Path(__file__).resolve().parents[2]

def main():
    if os.name!='nt':return 2
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(),os.O_BINARY);msvcrt.setmode(sys.stdout.fileno(),os.O_BINARY)
    try:
        config=json.loads((ROOT/'.local/desktop/chrome-native-config.json').read_text(encoding='utf-8'))
        if config.get('schema')!='applebuy-native-registration/v1' or config.get('hostName')!=HOST_NAME or len(sys.argv)<2 or sys.argv[1]!=extension_origin(config.get('extensionId')):return 2
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
    try:
        while not stopped.is_set():
            try:
                ticket=json.loads((ROOT/'.local/desktop/chrome-native-ticket.json').read_text(encoding='utf-8'))
                if ticket.get('schema')!='applebuy-native-ticket/v1' or ticket.get('extensionId')!=config['extensionId'] or not time.time()<ticket.get('expiresAt',0)<=time.time()+90 or not valid_pipe(ticket.get('pipe')) or ticket.get('nonce') in seen:raise ValueError()
                key=base64.b64decode(ticket['key'],validate=True)
                if len(key)!=32:raise ValueError()
            except Exception:stopped.wait(.5);continue
            connection=None
            try:
                connection=Client(ticket['pipe'],family='AF_PIPE',authkey=key)
                if not connection.poll(5):raise ValueError()
                request=probe_request(decode(connection.recv_bytes(64_000)))
                if request['nonce']!=ticket['nonce']:raise ValueError()
                seen.add(request['nonce']);write_frame(sys.stdout.buffer,request)
                deadline=time.monotonic()+20;reply=None
                while time.monotonic()<deadline and not stopped.is_set():
                    try:value=incoming.get(timeout=.2)
                    except queue.Empty:continue
                    try:reply=probe_result(value,request['nonce']);break
                    except ValueError:continue
                if reply is None:raise ValueError()
                connection.send_bytes(json.dumps(reply).encode('utf-8'))
            except Exception:pass
            finally:
                if connection:connection.close()
            if len(seen)>32:seen={ticket['nonce']}
            stopped.wait(.3)
        return 0
    finally:stopped.set()

if __name__=='__main__':sys.exit(main())
