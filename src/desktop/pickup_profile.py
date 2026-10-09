"""Optional per-Windows-user DPAPI profile. No account password, cookie or purchase authority."""
from pathlib import Path
import ctypes
from ctypes import wintypes
import json, os, re, tempfile

FIELDS={'lastName','firstName','phone','email','identitySuffix'}
def validate(values):
    if not isinstance(values,dict) or set(values)-FIELDS:raise ValueError('Unsupported pickup fields')
    out={}
    for key,value in values.items():
        if not isinstance(value,str) or len(value)>100 or any(ord(c)<32 for c in value):raise ValueError('Invalid pickup field')
        value=value.strip()
        if not value:continue
        if key=='identitySuffix' and not re.fullmatch(r'\d{4}',value):raise ValueError('Invalid identity suffix')
        if key=='phone' and not re.fullmatch(r'[+0-9 ()-]{6,30}',value):raise ValueError('Invalid phone')
        if key=='email' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):raise ValueError('Invalid email')
        out[key]=value
    return out

class Blob(ctypes.Structure):
    _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]

def crypt(data,protect):
    if os.name!='nt':raise RuntimeError('Windows user encryption required')
    if not isinstance(data,bytes) or len(data)>20000:raise ValueError('Profile size invalid')
    buf=ctypes.create_string_buffer(data);source=Blob(len(data),ctypes.cast(buf,ctypes.POINTER(ctypes.c_ubyte)));target=Blob()
    api=ctypes.WinDLL('crypt32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    fn=api.CryptProtectData if protect else api.CryptUnprotectData
    fn.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)];fn.restype=wintypes.BOOL
    kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
    if not fn(ctypes.byref(source),None,None,None,None,1,ctypes.byref(target)):raise RuntimeError('Pickup profile encryption unavailable')
    try:return ctypes.string_at(target.data,target.size)
    finally:kernel.LocalFree(target.data)

class PickupProfile:
    def __init__(self,path,codec=crypt):self.path=Path(path);self.codec=codec
    def load(self):
        if not self.path.exists():return None
        raw=self.path.read_bytes()
        if len(raw)>20000 or not raw.startswith(b'AppleBuy-pickup-v1\n'):raise ValueError('Profile format invalid')
        value=json.loads(self.codec(raw.split(b'\n',1)[1],False).decode('utf-8'))
        return validate(value)
    def save(self,values):
        encrypted=self.codec(json.dumps(validate(values),ensure_ascii=False,separators=(',',':')).encode('utf-8'),True)
        self.path.parent.mkdir(parents=True,exist_ok=True)
        fd,tmp=tempfile.mkstemp(prefix='pickup-',suffix='.tmp',dir=self.path.parent)
        try:
            with os.fdopen(fd,'wb') as f:f.write(b'AppleBuy-pickup-v1\n'+encrypted);f.flush();os.fsync(f.fileno())
            os.replace(tmp,self.path)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    def forget(self):self.path.unlink(missing_ok=True)
