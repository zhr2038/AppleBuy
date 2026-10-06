"""Isolated native stdio/pipe fixture only; never installation, production ticket or browser."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
mode,folder=sys.argv[1:3];fixture=Path(folder).resolve();assert fixture.is_relative_to(ROOT/'.local/test-runs')
if mode=='host':
    import checkout_native_host as module
    module.ROOT=fixture;sys.argv=[__file__,'chrome-extension://'+'a'*32+'/']
elif mode=='broker':
    import checkout_native_broker as module
    module.ROOT=fixture;module.CONFIG=fixture/'.local/desktop/checkout-native-config.json';module.TICKET=fixture/'.local/desktop/checkout-native-ticket.json';sys.argv=[__file__,'FAKE-C123-native-context']
else:raise ValueError('Unknown fixture')
sys.exit(module.main())
