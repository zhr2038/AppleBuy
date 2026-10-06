"""Prepare a pinned-origin host. --install is a separately authorized current-user registration, never automatic."""
from pathlib import Path
import argparse
import json
import os
import sys
from chrome_native_protocol import HOST_NAME,extension_origin
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'.local/desktop/native-host'

def installation(extension_id,python_path=None):
    origin=extension_origin(extension_id)
    python=Path(python_path or sys.executable).resolve()
    launcher=DEST/'applebuy-native.cmd'
    script=ROOT/'src/desktop/chrome_native_host.py'
    for path in (python,script,launcher):
        if not str(path).isascii() or any(c in str(path) for c in ('\n','\r','%','"')):raise ValueError('UnsupportedPath')
    command='@echo off\r\n"'+str(python)+'" -B -X utf8 "'+str(script)+'" %*\r\n'
    manifest={'name':HOST_NAME,'description':'AppleBuy own desktop read-only official bag connection','path':str(launcher),'type':'stdio','allowed_origins':[origin]}
    return command,manifest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--extension-id',required=True);parser.add_argument('--install',action='store_true');args=parser.parse_args()
    command,manifest=installation(args.extension_id)
    if not args.install:
        print(json.dumps({'preparedOnly':True,'nativeHostName':HOST_NAME,'allowedOrigins':manifest['allowed_origins'],'currentUserRegistration':True,'operation':'read-only official shopping bag','registryChanged':False}));return 0
    if os.name!='nt':raise ValueError('WindowsOnly')
    import winreg
    manifest_file=DEST/'host.json';key_path=r'Software\Google\Chrome\NativeMessagingHosts'+'\\'+HOST_NAME
    config=ROOT/'.local/desktop/chrome-native-config.json'
    if config.exists():
        old=json.loads(config.read_text(encoding='utf-8'))
        if old.get('extensionId')!=args.extension_id or old.get('hostName')!=HOST_NAME:raise ValueError('OtherRegistrationPreserved')
    views=(winreg.KEY_WOW64_32KEY,winreg.KEY_WOW64_64KEY)
    for view in views:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,key_path,0,winreg.KEY_READ|view) as key:
                previous=winreg.QueryValueEx(key,'')[0]
                if Path(previous).resolve()!=manifest_file.resolve():raise ValueError('OtherRegistrationPreserved')
        except FileNotFoundError:pass
    DEST.mkdir(parents=True,exist_ok=True);(DEST/'applebuy-native.cmd').write_bytes(command.encode('utf-8'));manifest_file.write_bytes(json.dumps(manifest,indent=2).encode('utf-8'))
    config.write_bytes(json.dumps({'schema':'applebuy-native-registration/v1','extensionId':args.extension_id,'hostName':HOST_NAME}).encode('utf-8'))
    for view in views:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER,key_path,0,winreg.KEY_SET_VALUE|view) as key:winreg.SetValueEx(key,'',0,winreg.REG_SZ,str(manifest_file))
    print(json.dumps({'installed':True,'scope':'current-user pinned extension read-only connection','registryKey':key_path,'noProfilesOrCookiesRead':True}));return 0

if __name__=='__main__':sys.exit(main())
