import { enqueueNotice } from '../aftercare/notices.js';
import { randomUUID, createHash } from 'node:crypto';
import { ApiError } from '../errors.js';
import { indiaDate, boatDetails, registrationKey, documentMetadata, documentBytes, completeDocuments, publicBoat, privateBoat, approvalChecks } from './domain.js';
import { documentScanner } from './scanner.js';
const actorKey = actor => actor.role + ':' + actor.id;
export class BoatRegistry {
  constructor(repository, {
    production = repository.config?.production || false,
    scan = documentScanner({
      NODE_ENV: repository.config?.production ? 'production' : 'development',
      CLAMAV_HOST: process.env.CLAMAV_HOST,
      CLAMAV_PORT: process.env.CLAMAV_PORT
    })
  } = {}) {
    this.repo = repository;
    this.production = production;
    this.scan = scan;
  }
  c(name) {
    return this.repo.c(name);
  }
  async audit(boat, actor, action, session, extra = {}) {
    await this.c('boat_audit').insertOne({
      _id: randomUUID(),
      boatId: boat._id,
      revision: boat.revision,
      actor: actorKey(actor),
      action,
      at: new Date().toISOString(),
      ...extra
    }, {
      session
    });
  }
  async load(id, actor, session) {
    const boat = await this.c('boats').findOne({
      _id: id
    }, {
      session
    });
    if (!boat || actor.role !== 'admin' && boat.ownerId !== actor.id) throw new ApiError(404, 'Boat not found.');
    return boat;
  }
  checkRevision(boat, revision) {
    if (!Number.isInteger(revision) || boat.revision !== revision) throw new ApiError(409, 'Boat changed. Reload before saving.');
  }
  async mutable(boat, session) {
    const today = indiaDate();
    if ((await this.c('bookings').findOne({
      'boat.id': boat._id,
      'trip.date': {
        $gte: today
      },
      status: 'confirmed'
    }, {
      session,
      projection: {
        _id: 1
      }
    })) || (await this.c('payments').findOne({
      'payload.boatId': boat._id,
      status: {
        $in: ['creating', 'creation_unknown', 'created']
      },
      expires: {
        $gt: Date.now()
      }
    }, {
      session,
      projection: {
        _id: 1
      }
    }))) throw new ApiError(409, 'Boat has upcoming bookings or active checkout holds. Changes need operational reconciliation first.');
  }
  async create(actor, input) {
    const details = boatDetails(input),
      boat = {
        _id: 'BT-' + randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
        ownerId: actor.role === 'owner' ? actor.id : null,
        createdBy: actorKey(actor),
        status: 'draft',
        language: input.language === 'hi' ? 'hi' : 'en',
        revision: 1,
        details,
        registrationKey: registrationKey(details),
        documents: {},
        createdAt: new Date().toISOString(),
        bookingFence: 0
      };
    try {
      return await this.repo.transaction(async session => {
        if (actor.role === 'admin') {
          const owner = typeof input.ownerEmail === 'string' ? await this.c('users').findOne({
            email: input.ownerEmail.trim().toLowerCase()
          }, {
            session
          }) : null;
          if (!owner) throw new ApiError(400, 'Enter the registered email of a verified boat owner.');
          boat.ownerId = owner._id;
        }
        await this.repo.verification.require(boat.ownerId, session);
        if (actor.role === 'owner') await this.c('users').updateOne({
          _id: actor.id
        }, {
          $inc: {
            fleetFence: 1
          }
        }, {
          session
        });
        if (actor.role === 'owner' && (await this.c('boats').countDocuments({
          ownerId: actor.id,
          status: {
            $in: ['draft', 'pending', 'rejected']
          }
        }, {
          session
        })) >= 10) throw new ApiError(409, 'Too many unfinished registrations. Contact an administrator.');
        await this.c('boats').insertOne(boat, {
          session
        });
        await this.audit(boat, actor, 'created', session);
        return privateBoat(boat, actor);
      });
    } catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'This boat registration is already registered. Contact an administrator.');
      throw error;
    }
  }
  async list(actor, query = {}) {
    const filter = actor.role === 'admin' ? {} : {
        ownerId: actor.id
      },
      offset = Number(query.offset || 0),
      limit = 50;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(400, 'Invalid page.');
    return this.repo.transaction(async session => ({
      boats: (await this.c('boats').find(filter, {
        session
      }).sort({
        createdAt: -1,
        _id: 1
      }).skip(offset).limit(limit).toArray()).map(boat => privateBoat(boat, actor)),
      total: await this.c('boats').countDocuments(filter, {
        session
      }),
      offset,
      limit
    }));
  }
  async detail(id, actor) {
    const boat = await this.load(id, actor);
    const audits = await this.c('boat_audit').find({
      boatId: id
    }, {
      projection: {
        _id: 0,
        action: 1,
        at: 1,
        revision: 1,
        ...(actor.role === 'admin' ? {
          actor: 1,
          notes: 1,
          documentId: 1,
          sha256: 1
        } : {})
      }
    }).sort({
      at: -1
    }).limit(30).toArray();
    return {
      ...privateBoat(boat, actor),
      ...(actor.role === 'admin' ? {
        ownerVerification: await this.repo.verification.status(boat.ownerId)
      } : {}),
      audit: audits
    };
  }
  async assignOwner(id, actor, input) {
    if (actor.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    if (typeof input.ownerEmail !== 'string' || input.declaration !== true || typeof input.notes !== 'string' || input.notes.trim().length < 10 || input.notes.length > 2000) throw new ApiError(400, 'Enter the verified owner email, authority declaration and review notes.');
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (boat.ownerId) throw new ApiError(409, 'This boat already has an owner. Ownership transfers need separate review.');
      const user = await this.c('users').findOne({
        email: input.ownerEmail.trim().toLowerCase()
      }, {
        session
      });
      if (!user) throw new ApiError(400, 'Enter the registered email of a verified boat owner.');
      await this.repo.verification.require(user._id, session);
      boat.ownerId = user._id;
      boat.status = 'draft';
      boat.revision++;
      boat.createdBy = actorKey(actor);
      boat.review = null;
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          ownerId: user._id,
          status: 'draft',
          revision: boat.revision,
          createdBy: boat.createdBy,
          review: null
        },
        $inc: {
          bookingFence: 1
        }
      }, {
        session
      });
      await this.audit(boat, actor, 'owner_linked', session, {
        ownerId: user._id,
        notes: input.notes.trim()
      });
      return privateBoat(boat, actor);
    });
  }
  async update(id, actor, input) {
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (actor.role === 'admin' && boat.createdBy !== actorKey(actor)) throw new ApiError(403, 'Only the submitting owner or admin may edit boat details.');
      if (!['draft', 'rejected', 'approved', 'suspended'].includes(boat.status)) throw new ApiError(409, 'Withdraw a pending submission before editing.');
      await this.repo.verification.require(boat.ownerId, session);
      await this.mutable(boat, session);
      if (Object.keys(boat.pendingDocuments || {}).length) throw new ApiError(409, 'Review pending document renewals before editing boat details.');
      const details = boatDetails(input.details);
      if (registrationKey(details) !== boat.registrationKey) throw new ApiError(409, 'Registration identity cannot be changed. Contact an administrator.');
      boat.details = details;
      boat.status = 'draft';
      boat.revision++;
      boat.review = null;
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          details,
          status: boat.status,
          revision: boat.revision,
          review: null
        },
        $inc: {
          bookingFence: 1
        }
      }, {
        session
      });
      await this.audit(boat, actor, 'details_updated', session);
      return privateBoat(boat, actor);
    });
  }
  async upload(id, actor, input) {
    const initial = await this.load(id, actor);
    this.checkRevision(initial, input.revision);
    if (actor.role === 'admin' && initial.createdBy !== actorKey(actor)) throw new ApiError(403, 'Only the submitting owner or admin may upload documents.');
    if (initial.status === 'approved' && input.declaration !== true) throw new ApiError(400, 'Accept the authenticity declaration for document renewal.');
    const metadata = documentMetadata(input),
      file = documentBytes(input),
      scanStatus = await this.scan(file.bytes),
      sha256 = createHash('sha256').update(file.bytes).digest('hex'),
      documentId = randomUUID();
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (actor.role === 'admin' && boat.createdBy !== actorKey(actor)) throw new ApiError(403, 'Only the submitting owner or admin may upload documents.');
      if (!['draft', 'rejected', 'approved', 'suspended'].includes(boat.status)) throw new ApiError(409, 'Withdraw a pending submission before changing documents.');
      await this.repo.verification.require(boat.ownerId, session);
      const renewal = boat.status === 'approved';
      if (!renewal) await this.mutable(boat, session);
      const stored = await this.c('boat_documents').aggregate([{
        $match: {
          boatId: id
        }
      }, {
        $group: {
          _id: null,
          total: {
            $sum: '$size'
          },
          count: {
            $sum: 1
          }
        }
      }], {
        session
      }).next();
      if (stored && (stored.total + file.bytes.length > 100 * 1024 * 1024 || stored.count >= 64)) throw new ApiError(409, 'Document storage limit reached. Contact an administrator.');
      await this.c('boat_documents').insertOne({
        _id: documentId,
        boatId: id,
        ownerId: boat.ownerId,
        uploadedBy: actorKey(actor),
        category: metadata.category,
        mime: file.mime,
        bytes: file.bytes,
        size: file.bytes.length,
        sha256,
        scanStatus,
        createdAt: new Date().toISOString()
      }, {
        session
      });
      const nextDocument = {
        ...metadata,
        id: documentId,
        mime: file.mime,
        size: file.bytes.length,
        sha256,
        scanStatus
      };
      if (renewal) boat.pendingDocuments = {
        ...(boat.pendingDocuments || {}),
        [metadata.category]: {
          ...nextDocument,
          uploadedBy: actorKey(actor)
        }
      };else {
        boat.documents[metadata.category] = nextDocument;
        boat.status = 'draft';
        boat.review = null;
      }
      boat.revision++;
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          documents: boat.documents,
          pendingDocuments: boat.pendingDocuments || {},
          status: boat.status,
          revision: boat.revision,
          review: boat.review || null
        },
        $inc: {
          bookingFence: 1
        }
      }, {
        session
      });
      await this.audit(boat, actor, renewal ? 'document_renewal_uploaded' : 'document_uploaded', session, {
        category: metadata.category,
        documentId,
        sha256
      });
      return privateBoat(boat, actor);
    });
  }
  async reviewRenewals(id, actor, input) {
    if (actor.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    if (!['approve', 'reject'].includes(input.action) || typeof input.notes !== 'string' || input.notes.trim().length < 10 || input.notes.length > 2000) throw new ApiError(400, 'Choose a review action and enter a reason.');
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      const pending = boat.pendingDocuments || {};
      if (!Object.keys(pending).length) throw new ApiError(409, 'No document renewals are awaiting review.');
      if (input.action === 'approve') {
        if (boat.status !== 'approved') throw new ApiError(409, 'Only approved boats can publish document renewals.');
        if (Object.values(pending).some(doc => doc.uploadedBy === actorKey(actor))) throw new ApiError(403, 'A different administrator must review this submission.');
        await this.repo.verification.require(boat.ownerId, session);
        approvalChecks(input);
        const merged = {
          ...boat.documents
        };
        for (const [category, document] of Object.entries(pending)) {
          if (boat.documents[category]?.expiresOn && document.expiresOn && document.expiresOn < boat.documents[category].expiresOn) throw new ApiError(409, 'A renewal cannot shorten an approved document validity.');
          const clean = {
            ...document
          };
          delete clean.uploadedBy;
          merged[category] = clean;
        }
        const latestBooking = await this.c('bookings').find({
          'boat.id': id,
          status: 'confirmed'
        }, {
          session
        }).sort({
          'trip.date': -1
        }).limit(1).next();
        const latestHold = await this.c('payments').find({
          'payload.boatId': id,
          status: {
            $in: ['creating', 'creation_unknown', 'created']
          },
          expires: {
            $gt: Date.now()
          }
        }, {
          session
        }).sort({
          'payload.date': -1
        }).limit(1).next();
        const date = [indiaDate(), latestBooking?.trip.date, latestHold?.payload.date].filter(Boolean).sort().at(-1);
        if (!completeDocuments({
          ...boat,
          documents: merged
        }, date, this.production)) throw new ApiError(409, 'Renewal documents must cover all confirmed journeys and active checkouts.');
        boat.documents = merged;
      }
      boat.pendingDocuments = {};
      boat.revision++;
      boat.renewalReview = {
        status: input.action === 'approve' ? 'approved' : 'rejected',
        notes: input.notes.trim(),
        at: new Date().toISOString(),
        by: actor.id
      };
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          documents: boat.documents,
          pendingDocuments: {},
          revision: boat.revision,
          renewalReview: boat.renewalReview
        },
        $inc: {
          bookingFence: 1
        }
      }, {
        session
      });
      await this.audit(boat, actor, 'document_renewal_' + input.action, session, {
        notes: input.notes.trim(),
        documents: Object.values(pending).map(doc => doc.id)
      });
      const owner = boat.ownerId ? await this.c('users').findOne({
        _id: boat.ownerId
      }, {
        session
      }) : null;
      await enqueueNotice(this.repo, {
        id: 'renewal:' + id + ':' + boat.revision,
        boatId: id,
        notice: {
          event: 'document_renewal_' + input.action,
          reference: id,
          language: boat.language,
          heading: input.action === 'approve' ? 'Boat document renewal approved' : 'Boat document renewal declined',
          body: 'View your boat registration for the reviewed document status and decision reason.',
          fields: [['Vessel', boat.details.name]]
        },
        recipients: [...(owner ? [{
          audience: 'owner',
          email: owner.email,
          phone: owner.phone
        }] : []), {
          audience: 'admin'
        }]
      }, session);
      return privateBoat(boat, actor);
    });
  }
  async submit(id, actor, input) {
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (actor.role === 'admin' && boat.createdBy !== actorKey(actor)) throw new ApiError(403, 'Only the submitting owner or admin may submit.');
      if (!['draft', 'rejected'].includes(boat.status)) throw new ApiError(409, 'Boat is not ready for submission.');
      await this.repo.verification.require(boat.ownerId, session);
      if (input.declaration !== true || !completeDocuments(boat, undefined, this.production)) throw new ApiError(400, 'Attach every required, valid document and accept the operator declaration.');
      boat.status = 'pending';
      boat.revision++;
      boat.submittedAt = new Date().toISOString();
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          status: boat.status,
          revision: boat.revision,
          submittedAt: boat.submittedAt
        }
      }, {
        session
      });
      await this.audit(boat, actor, 'submitted', session);
      return privateBoat(boat, actor);
    });
  }
  async review(id, actor, input) {
    if (actor.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    if (!['approve', 'reject', 'suspend', 'withdraw'].includes(input.action) || typeof input.notes !== 'string' || input.notes.trim().length < 10 || input.notes.length > 2000) throw new ApiError(400, 'Choose a review action and enter a reason.');
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (input.action === 'approve' || input.action === 'reject') {
        if (boat.status !== 'pending') throw new ApiError(409, 'Only pending submissions can be reviewed.');
        if (boat.createdBy === actorKey(actor)) throw new ApiError(403, 'A different administrator must review this submission.');
      }
      if (input.action === 'approve') {
        await this.repo.verification.require(boat.ownerId, session);
        const checks = approvalChecks(input);
        if (!completeDocuments(boat, undefined, this.production)) throw new ApiError(409, 'Documents are missing, expired or not clean.');
        boat.review = {
          by: actor.id,
          at: new Date().toISOString(),
          notes: input.notes.trim(),
          checks
        };
        boat.status = 'approved';
      }
      if (input.action === 'reject') {
        boat.status = 'rejected';
        boat.review = {
          by: actor.id,
          at: new Date().toISOString(),
          notes: input.notes.trim()
        };
      }
      if (input.action === 'suspend') {
        if (boat.status !== 'approved') throw new ApiError(409, 'Only an approved boat can be suspended.');
        boat.status = 'suspended';
        boat.review = {
          ...boat.review,
          suspensionReason: input.notes.trim()
        };
      }
      if (input.action === 'withdraw') {
        if (boat.status !== 'pending') throw new ApiError(409, 'Only a pending submission can be withdrawn.');
        boat.status = 'draft';
      }
      boat.revision++;
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          status: boat.status,
          review: boat.review || null,
          revision: boat.revision
        },
        $inc: {
          bookingFence: 1
        }
      }, {
        session
      });
      await this.audit(boat, actor, input.action, session, {
        notes: input.notes.trim()
      });
      return privateBoat(boat, actor);
    });
  }
  async withdraw(id, actor, input) {
    return this.repo.transaction(async session => {
      const boat = await this.load(id, actor, session);
      this.checkRevision(boat, input.revision);
      if (boat.status !== 'pending') throw new ApiError(409, 'Only a pending submission can be withdrawn.');
      boat.status = 'draft';
      boat.revision++;
      await this.c('boats').updateOne({
        _id: id
      }, {
        $set: {
          status: 'draft',
          revision: boat.revision
        }
      }, {
        session
      });
      await this.audit(boat, actor, 'withdraw', session);
      return privateBoat(boat, actor);
    });
  }
  async download(id, documentId, actor) {
    await this.load(id, actor);
    const doc = await this.c('boat_documents').findOne({
      _id: documentId,
      boatId: id
    });
    if (!doc) throw new ApiError(404, 'Document not found.');
    return {
      mime: doc.mime,
      bytes: Buffer.from(doc.bytes.buffer),
      category: doc.category
    };
  }
  async catalog() {
    const today = indiaDate();
    const rows = await this.c('boats').find({
      status: 'approved'
    }).sort({
      'details.name': 1
    }).toArray();
    return {
      boats: (await Promise.all(rows.filter(boat => completeDocuments(boat, today, this.production)).map(async boat => {
        const state = await this.repo.verification.status(boat.ownerId);
        return state.mobileVerified && state.identityVerified ? publicBoat(boat) : null;
      }))).filter(Boolean)
    };
  }
  async bookable(id, date, session) {
    const boat = session ? await this.c('boats').findOneAndUpdate({
      _id: id,
      status: 'approved'
    }, {
      $inc: {
        bookingFence: 1
      }
    }, {
      session,
      returnDocument: 'after'
    }) : await this.c('boats').findOne({
      _id: id,
      status: 'approved'
    }, {
      readConcern: {
        level: 'linearizable'
      },
      maxTimeMS: 5000
    });
    if (!boat || !completeDocuments(boat, date, this.production)) throw new ApiError(409, 'Boat is not approved or its documents are not valid for this trip.');
    await this.repo.verification.require(boat.ownerId, session);
    return publicBoat(boat);
  }
}
