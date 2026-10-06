"""Prepared owned stdio-to-authenticated-pipe stream. No file log of payloads and no browser/profile access."""
from pathlib import Path
from multiprocessing.connection import Listener
import base64,json,os,secrets,sys,threading,time
from chrome_native_protocol import extension_origin,decode
from checkout_native_host import NAME,PREFIX,valid_context
ROOT=Path(__file__).resolve().parents[2];CONFIG=ROOT/'.local/desktop/checkout-native-config.json';TICKET=ROOT/'.local/desktop/checkout-native-ticket.json'
START_DEADLINE=90
def cleanup(context):
    try:
        value=json.loads(TICKET.read_text(encoding='utf8'))
        if value.get('schema')=='applebuy-checkout-ticket/v1' and value.get('contextId')==context:TICKET.unlink()
    except (OSError,ValueError):pass
def main():
    listener=None;conn=None;timer=None;context=sys.argv[1] if len(sys.argv)==2 else None
    try:
        if os.name!='nt' or not valid_context(context):raise ValueError()
        config=json.loads(CONFIG.read_text(encoding='utf8'))
        if config.get('hostName')!=NAME:raise ValueError()
        extension_origin(config['extensionId']);pipe=PREFIX+secrets.token_hex(16);key=secrets.token_bytes(32)
        listener=Listener(pipe,family='AF_PIPE',authkey=key)
        ticket={'schema':'applebuy-checkout-ticket/v1','extensionId':config['extensionId'],'contextId':context,'pipe':pipe,'key':base64.b64encode(key).decode('ascii'),'expiresAt':time.time()+110}
        TICKET.parent.mkdir(parents=True,exist_ok=True);temp=TICKET.with_suffix('.'+secrets.token_hex(8)+'.tmp');temp.write_bytes(json.dumps(ticket).encode('utf8'));os.replace(temp,TICKET)
        def expire():cleanup(context);os._exit(2)
        timer=threading.Timer(START_DEADLINE,expire);timer.daemon=True;timer.start();conn=listener.accept();timer.cancel();timer=None;cleanup(context)
        while True:
            line=sys.stdin.buffer.readline(64002)
            if not line:break
            request=decode(line.rstrip(b'\r\n'))
            if request.get('schema')!='applebuy-native-checkout/v1' or request.get('contextId')!=context or request.get('kind')!='request':raise ValueError()
            conn.send_bytes(json.dumps(request).encode('utf8'))
            if not conn.poll(18):raise ValueError()
            response=decode(conn.recv_bytes(64000))
            if response.get('schema')!=request['schema'] or response.get('contextId')!=context or response.get('id')!=request.get('id') or response.get('kind')!='reply':raise ValueError()
            sys.stdout.write(json.dumps(response,ensure_ascii=True)+'\n');sys.stdout.flush()
            if request.get('operation')=='closeSession':break
        return 0
    except Exception:return 1
    finally:
        if timer:timer.cancel()
        if conn:conn.close()
        if listener:listener.close()
        cleanup(context)
if __name__=='__main__':sys.exit(main())
