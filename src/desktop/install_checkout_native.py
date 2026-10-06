"""Separate prepared checkout registration; no silent upgrade of the installed readonly host."""
from pathlib import Path
import argparse,json,os,sys
from chrome_native_protocol import extension_origin
from checkout_native_host import NAME
ROOT=Path(__file__).resolve().parents[2];DEST=ROOT/'.local/desktop/checkout-native-host'
def installation(extension_id):
    origin=extension_origin(extension_id);python=Path(sys.executable).resolve();script=ROOT/'src/desktop/checkout_native_host.py';launcher=DEST/'applebuy-checkout.cmd'
    for p in (python,script,launcher):
        if not str(p).isascii() or any(c in str(p) for c in ('\r','\n','%','"')):raise ValueError('UnsupportedPath')
    return '@echo off\r\n"'+str(python)+'" -B -X utf8 "'+str(script)+'" %*\r\n',{'name':NAME,'description':'AppleBuy separate checkout channel; one explicit local task; no payment','path':str(launcher),'type':'stdio','allowed_origins':[origin]}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--extension-id',required=True);parser.add_argument('--install',action='store_true');args=parser.parse_args();cmd,manifest=installation(args.extension_id)
    if not args.install:print(json.dumps({'preparedOnly':True,'hostName':NAME,'readonlyHostChanged':False,'registryChanged':False}));return 0
    if os.name!='nt':raise ValueError('WindowsOnly')
    import winreg
    file=DEST/'host.json';cfg=ROOT/'.local/desktop/checkout-native-config.json';key=r'Software\Google\Chrome\NativeMessagingHosts'+'\\'+NAME;views=(winreg.KEY_WOW64_32KEY,winreg.KEY_WOW64_64KEY)
    if cfg.exists() and json.loads(cfg.read_text(encoding='utf8')).get('extensionId')!=args.extension_id:raise ValueError('OtherRegistrationPreserved')
    for view in views:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,key,0,winreg.KEY_READ|view) as handle:
                if Path(winreg.QueryValueEx(handle,'')[0]).resolve()!=file.resolve():raise ValueError('OtherRegistrationPreserved')
        except FileNotFoundError:pass
    DEST.mkdir(parents=True,exist_ok=True);(DEST/'applebuy-checkout.cmd').write_bytes(cmd.encode('ascii'));file.write_bytes(json.dumps(manifest,indent=2).encode('utf8'));cfg.write_bytes(json.dumps({'hostName':NAME,'extensionId':args.extension_id}).encode('utf8'))
    for view in views:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER,key,0,winreg.KEY_SET_VALUE|view) as handle:winreg.SetValueEx(handle,'',0,winreg.REG_SZ,str(file))
    print(json.dumps({'installed':True,'hostName':NAME,'readonlyHostChanged':False,'scope':'separate current-user pinned checkout channel'}));return 0
if __name__=='__main__':sys.exit(main())
