"""Step 3: the two signature artifacts (Staff of the Fixed Star, Circlet of Nous) -> artifacts.json."""
import json

import paths
from db import DB
from describe import desc, item

STAFF = 'SOP_FixedStar'
CIRCLET = 'ART_CircletOfNous_Evolving'
CIRCLET_LOOKS = ['', '_B', '_C', '_D', '_D_Polished', '_F', '_G', '_H', '_I']
CIRCLET_FORMS = ['ART_CircletOfNous_Restored', 'ART_CircletOfNous_Legendary', 'HAI_FocusCirclet']


def main():
    db = DB.load()
    staff = item(db, STAFF, db.entry(STAFF).get('RootTemplate'))
    extra = {}
    for key, sid in (('surge', 'ART_ISS_SURGE'), ('grief', 'ART_ISS_BURNT_OUT'), ('shattered', 'ART_ISS_SHATTERED'),
                     ('last', 'ART_ISS_LAST_CHARGE'), ('escape', 'ART_STAFF_PLANAR_ESCAPE')):
        e = db.entry(sid)
        extra[key] = {'name': db.text(e.get('DisplayName')), 'desc': desc(db, e)}
    staff['extra'] = extra
    staff['rupture'] = [{'charges': n, 'damage': 4 * n, 'backlash': 16 * n} for n in (5, 10, 15, 20)]
    staff['rupture_desc'] = desc(db, db.entry('Shout_ART_ISS_SoulRupture'))

    circ = item(db, CIRCLET, db.entry(CIRCLET).get('RootTemplate'))
    circ['variants'] = []
    for suf in CIRCLET_LOOKS:
        e = db.entry(CIRCLET + suf)
        t = db.tpl(e.get('RootTemplate'))
        circ['variants'].append({'id': CIRCLET + suf, 'name': db.text(t.get('DisplayName')), 'desc': db.text(t.get('Description'))})
    circ['forms'] = [item(db, s, db.entry(s).get('RootTemplate')) for s in CIRCLET_FORMS if db.entry(s)]

    json.dump({'staff': staff, 'circlet': circ}, open(paths.work('artifacts.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('artifacts:', staff['name'], len(staff['spells']), 'staff spells;', len(circ['variants']), 'circlet looks')


if __name__ == '__main__':
    main()
