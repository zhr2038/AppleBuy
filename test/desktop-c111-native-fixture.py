"""Actual pipe/framing processes with isolated fake registration; never production registration or browser."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src/desktop'))
mode,folder=sys.argv[1:3];fixture=Path(folder).resolve();assert fixture.is_relative_to(ROOT/'.local/test-runs')
if mode in ('broker','broker-timeout'):
    import chrome_native_broker as module
    module.ROOT=fixture;module.CONFIG=fixture/'.local/desktop/chrome-native-config.json';module.TICKET=fixture/'.local/desktop/chrome-native-ticket.json'
    if mode=='broker-timeout':module.DEADLINE_SECONDS=1
elif mode=='host':
    import chrome_native_host as module
    module.ROOT=fixture;sys.argv=[__file__,'chrome-extension://'+'a'*32+'/']
else:raise ValueError('Fixture mode')
sys.exit(module.main())
