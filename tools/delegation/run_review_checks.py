"""One reviewed command enforces five foreground checks in order, with owned cleanup."""
from pathlib import Path
import json
import re
import sys
from process_tree import OwnedProcess

ROOT=Path(__file__).resolve().parents[2]
def main():
    if len(sys.argv)!=2:
        raise SystemExit('Expected one public candidate manifest')
    relative=sys.argv[1]
    path=(ROOT/relative).resolve()
    if not path.is_relative_to(ROOT/'docs/reviews') or not path.name.endswith('candidate-manifest.json') or not path.is_file():
        raise SystemExit('Out-of-scope manifest')
    check=[sys.executable,'-B',str(ROOT/'tools/delegation/verify_candidate_manifest.py'),relative]
    commands=[check,
      ['node','--test','--test-reporter=tap','test/desktop-c093-owner-recovery.test.ts','test/desktop-c072-store.test.ts','test/desktop-c078-runtime.test.ts','test/desktop-c084-cart-transfer.test.ts','test/desktop-c080-reconcile.test.ts','test/desktop-c107-browser.test.ts'],
      [sys.executable,'-B','-X','utf8','-m','unittest','discover','-s','test','-p','desktop_c*_test.py'],
      ['node','--test','--test-reporter=tap','test/*.test.ts','review/*.test.ts'],check]
    failed=False
    for order,argv in enumerate(commands,1):
        child=OwnedProcess(argv,ROOT,lambda pid:None)
        stdout,stderr,timed_out=child.communicate('',120)
        passed=child.process.returncode==0 and not timed_out
        row={'scope':'bounded-review-checks','order':order,'exitCode':child.process.returncode,'timedOut':timed_out,'ownedTreeCleanupConfirmed':True}
        if order in (1,5):
            try:row['manifest']=json.loads(stdout)
            except ValueError:passed=False
        elif order in (2,4):
            try:row['counts']={key:int(re.search(r'^# '+key+r' (\d+)$',stdout,re.M)[1]) for key in ('tests','pass','fail','cancelled','skipped')}
            except (TypeError,ValueError):passed=False
        else:
            count=re.search(r'Ran (\d+) tests',stderr)
            if count:row['tests']=int(count[1])
            else:passed=False
        row['passed']=passed
        if not passed:
            failed_test=re.search(r'^not ok .+$',stdout,re.M)
            row['failureTail']=stdout[failed_test.start():failed_test.start()+2000] if failed_test else (stdout+stderr)[-1800:]
        failed=failed or not passed
        print(json.dumps(row,ensure_ascii=True),flush=True)
    print(json.dumps({'scope':'bounded-review-checks','complete':True,'orderedChecks':5,'passed':not failed}),flush=True)
    return int(failed)

if __name__=='__main__':
    raise SystemExit(main())
