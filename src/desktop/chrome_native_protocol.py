"""Bounded JSON-only Chrome native messaging. No pickle, credentials, request bodies or commands."""
import json
import re
import struct
MAX_FRAME=64_000
HOST_NAME='com.applebuy.readonly'
PIPE_PREFIX=r'\\.\pipe\applebuy-readonly-'
PHASES={'EMPTY_BAG','BAG','AUTH','UNKNOWN'}

def pipe_name(nonce):
    if not isinstance(nonce,str) or not re.fullmatch(r'[0-9a-f]{32}',nonce):raise ValueError('PipeUnconfirmed')
    return PIPE_PREFIX+nonce

def valid_pipe(value):
    return isinstance(value,str) and value.startswith(PIPE_PREFIX) and bool(re.fullmatch(r'[0-9a-f]{32}',value[len(PIPE_PREFIX):]))

def extension_origin(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-p]{32}',value):raise ValueError('ExtensionIdUnconfirmed')
    return 'chrome-extension://'+value+'/'

def decode(raw):
    if len(raw)>MAX_FRAME:raise ValueError('MessageTooLarge')
    value=json.loads(raw.decode('utf-8'))
    if not isinstance(value,dict):raise ValueError('MessageUnconfirmed')
    return value

def read_frame(stream):
    header=stream.read(4)
    if not header:return None
    if len(header)!=4:raise ValueError('MessageUnconfirmed')
    size=struct.unpack('<I',header)[0]
    if not 1<=size<=MAX_FRAME:raise ValueError('MessageTooLarge')
    raw=stream.read(size)
    if len(raw)!=size:raise ValueError('MessageUnconfirmed')
    return decode(raw)

def write_frame(stream,value):
    raw=json.dumps(value,ensure_ascii=True,separators=(',',':')).encode('utf-8')
    if len(raw)>MAX_FRAME:raise ValueError('MessageTooLarge')
    stream.write(struct.pack('<I',len(raw))+raw);stream.flush()

def probe_request(value):
    if set(value)!={'schema','nonce','operation'} or value.get('schema')!='applebuy-chrome-readonly/v1' or value.get('operation')!='observe-bag' or not isinstance(value.get('nonce'),str) or not re.fullmatch(r'[0-9a-f]{32}',value['nonce']):raise ValueError('OperationNotAllowed')
    return dict(value)

def probe_result(value,nonce):
    if value.get('schema')!='applebuy-chrome-readonly/v1' or value.get('nonce')!=nonce or value.get('phase') not in PHASES or value.get('readOnly') is not True or type(value.get('mutationCount')) is not int or value.get('mutationCount')!=0 or value.get('tabClosed') is not True:raise ValueError('ResultUnconfirmed')
    return {'schema':value['schema'],'nonce':nonce,'phase':value['phase'],'readOnly':True,'mutationCount':0,'tabClosed':True}
