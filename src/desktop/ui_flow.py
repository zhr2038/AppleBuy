"""Presentation routing only. Backend purchase/ownership/consent checks stay authoritative."""
TERMS = {
    'https://www.apple.com.cn/shop/open/salespolicies',
    'https://www.apple.com.cn/shop/browse/open/salespolicies',
}

def current_consent(summary):
    if not isinstance(summary, dict):
        return False
    total = summary.get('totalCny')
    return summary.get('termsUrl') in TERMS and type(total) in (int, float) and 0 < total <= 9999

def primary_choice(*, busy, working, readonly, paused, owner_lost, attempted, complete,
                   can_open, can_advance, can_reconcile, can_submit, consent_current, phase):
    if owner_lost:
        return None, '执行权已丢失'
    if working:
        return None, '程序正在处理…'
    if not busy:
        return ('open' if can_open else None), ('连接并核对订单' if attempted or complete else '开始 / 继续')
    if attempted or complete:
        action = 'reconcile' if readonly and can_reconcile else 'advance' if not readonly and can_advance else None
        return action, '核对订单（只读）'
    if paused:
        action = 'reconcile' if readonly and can_reconcile else 'advance' if not readonly and can_advance else None
        return action, '只读核对' if readonly else '继续'
    if can_submit and consent_current and not readonly and phase == 'REVIEW':
        return 'submit', '接受条款并创建未付款订单'
    if readonly:
        return ('reconcile' if can_reconcile else None), '核对已有任务'
    if can_advance:
        return 'advance', '登录后继续' if phase == 'AUTH' else '继续'
    return None, '等待程序就绪'
