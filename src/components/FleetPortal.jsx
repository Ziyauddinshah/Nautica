import { useEffect, useState } from 'react';
import LanguageSwitcher, { useI18n } from '../i18n/I18nProvider.jsx';
import { AuthForm } from './AuthForm.jsx';
import { request } from '../lib/api.js';
import { boatDocumentTypes, fleetChecks } from '../domain/fleet.js';
import { types, seatLayout } from '../domain/booking.js';
const blank = {
  name: '',
  operatorName: '',
  registrationNumber: '',
  registrationAuthority: '',
  description: '',
  boardingInstructions: '',
  type: 'Wooden boat',
  propulsion: 'manual',
  pier: 'Assi Ghat',
  capacity: 6,
  lifeJackets: 7,
  fare: 100000,
  captainIncluded: true,
  amenities: []
};
const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Unable to read file.'));
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.readAsDataURL(file);
});
export default function FleetPortal({
  admin = false,
  user,
  onUser
}) {
  const {
      t
    } = useI18n(),
    [authenticated, setAuthenticated] = useState(false),
    [adminName, setAdminName] = useState(''),
    [login, setLogin] = useState({
      username: '',
      password: ''
    }),
    [boats, setBoats] = useState([]),
    [page, setPage] = useState({
      offset: 0,
      total: 0
    }),
    [offset, setOffset] = useState(0),
    [boat, setBoat] = useState(null),
    [details, setDetails] = useState({
      ...blank
    }),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState(''),
    [checks, setChecks] = useState({}),
    [declaration, setDeclaration] = useState(false),
    [upload, setUpload] = useState({
      category: 'registration',
      number: '',
      issuer: '',
      issuedOn: '',
      expiresOn: ''
    }),
    [file, setFile] = useState(null),
    [refresh, setRefresh] = useState(0);
  const base = admin ? '/api/admin/fleet' : '/api/owner/boats',
    ready = admin ? authenticated : Boolean(user);
  useEffect(() => {
    if (admin) request('/api/admin/session').then(result => {
      setAdminName(result.username);
      setAuthenticated(true);
    }).catch(() => setAuthenticated(false));
  }, [admin]);
  useEffect(() => {
    setBoat(null);
    setCreating(false);
    setBoats([]);
    if (!ready) return;
    const controller = new AbortController();
    request(base + '?offset=' + offset, {
      signal: controller.signal
    }).then(data => {
      setBoats(data.boats);
      setPage({
        offset: data.offset || 0,
        total: data.total || data.boats.length
      });
    }).catch(e => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, [ready, user?.id, refresh, base, offset]);
  async function run(work) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e.message);
      if (e.status === 401 && admin) setAuthenticated(false);
      if (e.status === 401 && !admin) onUser(null);
    } finally {
      setBusy(false);
    }
  }
  async function select(item) {
    await run(async () => {
      const data = await request(base + '/' + item.id);
      setBoat(data.boat);
      setDetails(data.boat.details);
      setCreating(false);
      setNotes('');
      setChecks({});
      setDeclaration(false);
      setFile(null);
    });
  }
  async function mutate(action, body) {
    const result = await request(base + '/' + boat.id + (action ? '/' + action : ''), {
      method: 'POST',
      ...(action==='documents'?{signal:AbortSignal.timeout(60000)}:{}),
      body: {
        ...body,
        revision: boat.revision
      }
    });
    setBoat(result.boat);
    setDetails(result.boat.details);
    setBoats(previous => previous.map(item => item.id === result.boat.id ? result.boat : item));
    setNotes('');
    setChecks({});
    setDeclaration(false);
  }
  const field = (key, label, props = {}) => <label key={key}>{t(label)}<input required value={details[key]} onChange={event => setDetails({
      ...details,
      [key]: props.type === 'number' ? Number(event.target.value) : event.target.value
    })} {...props} /></label>;
  const canEdit = !admin || boat?.createdBy === 'admin:' + adminName;
  const editable = canEdit && boat && ['draft', 'rejected', 'approved', 'suspended'].includes(boat.status);
  return <><header className="header"><a className="brand" href="/">⚓ Nautica.</a><LanguageSwitcher /><nav><a href={admin ? '/admin' : '/account'}>{t(admin ? 'Booking administration' : 'My account')}</a><a href="/">{t('Explore boats')}</a></nav></header><main className="fleet-portal"><h1>{t(admin ? 'Fleet review' : 'Register a boat')}</h1><p>{t('India / Varanasi. Only approved vessels with valid documents can accept new bookings.')}</p><p>{t('This platform checklist requires authority verification. Uploading documents does not grant legal permission to operate.')}</p>{error && <p role="alert">{t(error)}</p>}
 {!ready ? admin ? <form onSubmit={event => {
        event.preventDefault();
        run(async () => {
          await request('/api/admin/login', {
            method: 'POST',
            body: login
          });
          setAdminName(login.username);
          setLogin({
            username: '',
            password: ''
          });
          setAuthenticated(true);
        });
      }}><h2>{t('Admin sign in')}</h2><label>{t('Username')}<input required autoComplete="username" value={login.username} onChange={e => setLogin({
            ...login,
            username: e.target.value
          })} /></label><label>{t('Password')}<input required type="password" autoComplete="current-password" value={login.password} onChange={e => setLogin({
            ...login,
            password: e.target.value
          })} /></label><button disabled={busy} className="primary">{t('Sign in')}</button></form> : user === undefined ? <p role="status">{t('Loading…')}</p> : <AuthForm onSuccess={onUser} message={t('Sign in to register and manage your boats.')} /> : <>
 <button disabled={busy} onClick={() => setRefresh(v => v + 1)}>{t('Refresh')}</button> <button disabled={busy} className="primary" onClick={() => {
          setCreating(true);
          setBoat(null);
          setDetails({
            ...blank
          });
        }}>{t('Add boat')}</button>
 <div><button disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('Previous')}</button> {Math.min(page.total, offset + 1)}–{Math.min(page.total, offset + boats.length)} / {page.total}<button disabled={busy || offset + boats.length >= page.total} onClick={() => setOffset(offset + 50)}>{t('Next')}</button></div>
 <div className="fleet-workspace"><aside aria-label={t('Registered boats')}>{boats.length === 0 ? <p>{t('No registered boats yet.')}</p> : boats.map(item => <button key={item.id} disabled={busy} onClick={() => select(item)}><strong>{item.details.name}</strong><span>{t(item.status)}</span><small>{item.details.registrationNumber}</small></button>)}</aside><section>
 {(creating || boat) && <><h2>{creating ? t('New boat') : boat.details.name}</h2>{boat && <p>{t('Status')}: <strong>{t(boat.status)}</strong> · {t('Revision')}: {boat.revision}</p>}
 {(creating || editable) && <form className="fleet-details" onSubmit={e => {
                e.preventDefault();
                run(async () => {
                  if (creating) {
                    const result = await request(base, {
                      method: 'POST',
                      body: details
                    });
                    setBoat(result.boat);
                    setBoats(previous => [result.boat, ...previous]);
                    setCreating(false);
                  } else await mutate('', {
                    details
                  });
                });
              }}>
 {field('name', 'Boat name', {
                  maxLength: 80
                })}{field('operatorName', 'Owner / operator legal name', {
                  maxLength: 120
                })}{field('registrationNumber', 'Registration number', {
                  maxLength: 60,
                  disabled: !creating
                })}{field('registrationAuthority', 'Registration authority', {
                  maxLength: 160
                })}
 <label>{t('Boat type')}<select value={details.type} onChange={e => setDetails({
                    ...details,
                    type: e.target.value
                  })}>{types.slice(1).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('Propulsion')}<select value={details.propulsion} onChange={e => setDetails({
                    ...details,
                    propulsion: e.target.value
                  })}>{['manual', 'motor', 'electric'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
 <label>{t('Boarding pier')}<select value={details.pier} onChange={e => setDetails({
                    ...details,
                    pier: e.target.value
                  })}>{['Assi Ghat', 'Dashashwamedh Ghat'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
 {field('capacity', 'Certified passenger capacity', {
                  type: 'number',
                  min: 1,
                  max: 60
                })}{field('lifeJackets', 'Life jackets including captain', {
                  type: 'number',
                  min: 2,
                  max: 200
                })}
 <label>{t('Fare per group trip (INR)')}<input required type="number" min="1" max="1000000" step="0.01" value={details.fare / 100} onChange={e => setDetails({
                    ...details,
                    fare: Math.round(Number(e.target.value) * 100)
                  })} /></label>
 {['description', 'boardingInstructions'].map(key => <label key={key}>{t(key === 'description' ? 'Public description' : 'Boarding instructions')}<textarea required minLength={key === 'description' ? 20 : 10} maxLength={key === 'description' ? 1500 : 600} value={details[key]} onChange={e => setDetails({
                    ...details,
                    [key]: e.target.value
                  })} /></label>)}

 <p>{t('A qualified captain is required. The numbered seat plan must match the actual boat and certified passenger capacity.')}</p><button className="primary" disabled={busy}>{t(creating ? 'Create draft' : 'Save details as draft')}</button></form>}
 {boat && !editable && <dl>{Object.entries(boat.details).filter(([key]) => !['tone', 'amenities'].includes(key)).map(([key, value]) => <div key={key}><dt>{t({
                      name: 'Boat name',
                      operatorName: 'Owner / operator legal name',
                      registrationNumber: 'Registration number',
                      registrationAuthority: 'Registration authority',
                      description: 'Public description',
                      boardingInstructions: 'Boarding instructions',
                      type: 'Boat type',
                      propulsion: 'Propulsion',
                      pier: 'Boarding pier',
                      capacity: 'Certified passenger capacity',
                      lifeJackets: 'Life jackets including captain',
                      fare: 'Fare (paise)',
                      timeZone: 'Local time zone',
                      jurisdiction: 'Jurisdiction',
                      captainIncluded: 'Captain included'
                    }[key] || key)}</dt><dd>{typeof value === 'boolean' ? t(value ? 'Yes' : 'No') : t(String(value))}</dd></div>)}</dl>}
 {boat && <><h3>{t('Numbered passenger seats')}</h3><div className="fleet-seat-preview">{seatLayout(boat.details).map(seat => <span key={seat.id}>{seat.id}</span>)}</div><h3>{t('Private documents')}</h3><p>{t('PDF, PNG or JPEG only; maximum 5 MB per file. Provide issuer details and real validity dates. Documents remain private.')}</p><ul>{boatDocumentTypes.map(type => {
                    const document = boat.documents[type.id];
                    return <li key={type.id}>{t(type.label)}: {document ? <><a href={`${base}/${boat.id}/documents/${document.id}`}>{t('Download')}</a> · {document.number} · {document.expiresOn || t('No expiry recorded')}</> : t('Missing')}</li>;
                  })}</ul>
 {editable && <form className="fleet-details" onSubmit={e => {
                  e.preventDefault();
                  run(async () => {
                    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Choose a supported file up to 5 MB.');
                    await mutate('documents', {
                      ...upload,
                      mime: file.type,
                      data: await readFile(file)
                    });
                    setFile(null);
                  });
                }}>
 <label>{t('Document category')}<select value={upload.category} onChange={e => setUpload({
                      ...upload,
                      category: e.target.value
                    })}>{boatDocumentTypes.map(type => <option key={type.id} value={type.id}>{t(type.label)}</option>)}</select></label>
 {['number', 'issuer', 'issuedOn', 'expiresOn'].map(key => <label key={key}>{t({
                      number: 'Document number',
                      issuer: 'Issuing authority',
                      issuedOn: 'Issue date',
                      expiresOn: 'Expiry date'
                    }[key])}<input required={key !== 'expiresOn' || boatDocumentTypes.find(type => type.id === upload.category).expiring} type={key.endsWith('On') ? 'date' : 'text'} value={upload[key]} onChange={e => setUpload({
                      ...upload,
                      [key]: e.target.value
                    })} /></label>)}<label>{t('Document file')}<input key={boat.revision} required type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files[0])} /></label><button disabled={busy || !file}>{t('Upload document')}</button></form>}
 {canEdit && ['draft', 'rejected'].includes(boat.status) && <form onSubmit={e => {
                  e.preventDefault();
                  run(() => mutate('submit', {
                    declaration
                  }));
                }}><label className="fleet-check"><input type="checkbox" required checked={declaration} onChange={e => setDeclaration(e.target.checked)} />{t('I am authorized to operate this boat. Details and documents are authentic, current and match the actual boat.')}</label><button className="primary" disabled={busy || !declaration}>{t('Submit for admin review')}</button></form>}
 {boat.status === 'pending' && <button disabled={busy} onClick={() => run(() => mutate('withdraw', {}))}>{t('Withdraw submission')}</button>}
 {admin&&boat.status==='pending'&&boat.createdBy==='admin:'+adminName&&<p>{t('A different administrator must review this submission.')}</p>}
 {admin && ['pending', 'approved'].includes(boat.status) && (boat.status==='approved'||boat.createdBy!=='admin:'+adminName) && <form onSubmit={e => {
                  e.preventDefault();
                  run(() => mutate('review', {
                    action: boat.status === 'approved' ? 'suspend' : 'approve',
                    notes,
                    checks
                  }));
                }}><h3>{t('Authority verification')}</h3>{boat.status === 'pending' && fleetChecks.map(([key, label]) => <label className="fleet-check" key={key}><input type="checkbox" checked={Boolean(checks[key])} onChange={e => setChecks({
                      ...checks,
                      [key]: e.target.checked
                    })} />{t(label)}</label>)}<label>{t('Review notes / verified authority references')}<textarea required minLength={10} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label><button disabled={busy} className="primary">{t(boat.status === 'approved' ? 'Suspend new bookings' : 'Approve vessel')}</button>{boat.status === 'pending' && <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => run(() => mutate('review', {
                    action: 'reject',
                    notes
                  }))}>{t('Reject with reason')}</button>}</form>}
 {boat.review && <p>{t('Review notes')}: {boat.review.notes} {boat.review.suspensionReason}</p>}{boat.audit && <><h3>{t('Audit history')}</h3><ul>{boat.audit.map((event, index) => <li key={index}>{event.at} · {t(event.action)} · {event.revision} {admin && event.actor && <> · {event.actor}</>}</li>)}</ul></>}
 </>}
 </>}
 </section></div></>}
 </main></>;
}
