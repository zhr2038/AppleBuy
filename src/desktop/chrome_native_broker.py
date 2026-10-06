"""One owned, authenticated local named-pipe exchange. Existing Chrome remains extension-owned."""
from pathlib import Path
from multiprocessing.connection import Listener
import base64
import datetime as dt
import json
import os
import secrets
import sys
import threading
import time
from chrome_native_protocol import HOST_NAME,extension_origin,decode,probe_request,probe_result,pipe_name

ROOT=Path(__file__).resolve().parents[2]
CONFIG=ROOT/'.local/desktop/chrome-native-config.json'
TICKET=ROOT/'.local/desktop/chrome-native-ticket.json'
DEADLINE_SECONDS=90

def remove_ticket(nonce=None,expired_only=False):
    try:
        value=json.loads(TICKET.read_text(encoding='utf-8'))
        if value.get('schema')!='applebuy-native-ticket/v1':return
        if nonce is not None and value.get('nonce')!=nonce:return
        if expired_only and (type(value.get('expiresAt')) not in (int,float) or value['expiresAt']>time.time()):return
        TICKET.unlink()
    except (OSError,ValueError):pass

def expire(nonce):
    remove_ticket(nonce)
    os._exit(2)

def main():
    listener=None;connection=None;nonce=secrets.token_hex(16);timer=None
    try:
        if os.name!='nt':raise ValueError('WindowsOnly')
        config=json.loads(CONFIG.read_text(encoding='utf-8'))
        if config.get('schema')!='applebuy-native-registration/v1' or config.get('hostName')!=HOST_NAME:raise ValueError('RegistrationUnconfirmed')
        extension_origin(config['extensionId'])
        remove_ticket(expired_only=True)
        pipe=pipe_name(secrets.token_hex(16));key=secrets.token_bytes(32)
        listener=Listener(pipe,family='AF_PIPE',authkey=key)
        ticket={'schema':'applebuy-native-ticket/v1','extensionId':config['extensionId'],'pipe':pipe,'key':base64.b64encode(key).decode('ascii'),'nonce':nonce,'expiresAt':time.time()+85}
        TICKET.parent.mkdir(parents=True,exist_ok=True);temporary=TICKET.with_suffix('.'+nonce+'.tmp');temporary.write_bytes(json.dumps(ticket).encode('utf-8'));os.replace(temporary,TICKET)
        # Bounded even when no extension is loaded. Outer owned process also has a deadline.
        timer=threading.Timer(DEADLINE_SECONDS,lambda:expire(nonce));timer.daemon=True;timer.start()
        connection=listener.accept();connection.send_bytes(json.dumps(probe_request({'schema':'applebuy-chrome-readonly/v1','nonce':nonce,'operation':'observe-bag'})).encode('utf-8'))
        if not connection.poll(25):raise ValueError('ReadUnconfirmed')
        result=probe_result(decode(connection.recv_bytes(64_000)),nonce)
        print(json.dumps({'scope':'existing-chrome-readonly','phase':result['phase'],'readOnly':True,'mutationCount':0,'tabClosed':True,'personalProfileCopied':False}),flush=True)
        return 0
    except Exception:
        print(json.dumps({'scope':'existing-chrome-readonly','phase':'UNKNOWN','readOnly':True,'mutationCount':0,'confirmed':False,'reason':'normal-chrome-connection-unconfirmed'}),flush=True);return 1
    finally:
        if timer:timer.cancel()
        if connection:connection.close()
        if listener:listener.close()
        remove_ticket(nonce)

if __name__=='__main__':sys.exit(main())
