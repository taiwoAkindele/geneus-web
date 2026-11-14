import { rolesFor, type Permission, type Role, type Staff } from '@shared';

export const ROLE_LABELS: Record<Role, string> = {
  chew: 'CHEW', nurse: 'Nurse', doctor: 'Doctor', records_officer: 'Records',
  facility_admin: 'Facility Admin', supervisor: 'Supervisor', cashier: 'Cashier', insurance_officer: 'Insurance officer',
  laboratory_staff: 'Laboratory staff', pharmacy_staff: 'Pharmacy staff',
};
export const roleLabel = (staff: Pick<Staff, 'role' | 'additionalRoles'>): string =>
  rolesFor(staff).map((role) => ROLE_LABELS[role]).join(' + ');

export const PERMISSION_LABELS: Record<Permission, string> = {
  'patient_chart:read': 'View patient medical history',
  'admission:manage': 'Manage admissions and ward beds',
  'location:manage': 'Manage care locations', 'service:manage': 'Manage services',
  'result_template:manage': 'Manage lab result templates',
  'practitioner:manage': 'Manage professional profiles', 'credential:manage': 'Record credential evidence',
  'credential:read': 'Read restricted credential evidence', 'clinical_capability:review': 'Independently review clinical authority',
  'staff_assignment:manage': 'Manage service assignments', 'service_session:manage': 'Plan service coverage',
  'service_session:operate': 'Open and pause service intake', 'work_ownership:claim': 'Accept assigned work',
  'work_ownership:manage': 'Manage work responsibility',
  'clinical:assess': 'Assess patients', 'clinical:diagnose': 'Record diagnoses', 'clinical:prescribe': 'Prescribe medication',
  'clinical:collect_specimen': 'Collect specimens', 'clinical:perform_test': 'Perform laboratory tests',
  'clinical:record_result': 'Record laboratory results', 'clinical:verify_result': 'Check laboratory results',
  'clinical:release_result': 'Release laboratory results', 'clinical:dispense': 'Dispense medication',
  'clinical:administer': 'Administer treatments', 'pin_setup_code:claim': 'Claim own PIN setup code',
  'patient:create': 'Register patients', 'patient:update': 'Edit patient details',
  'patient_identity:review': 'Flag patient identity reviews', 'patient_identity:resolve': 'Resolve patient identities',
  'appointment:create': 'Book appointments', 'appointment:update': 'Manage booking attendance and dates', 'visit:create': 'Record visits',
  'encounter:record': 'Record clinical encounter steps',
  'handoff:create': 'Send patients to another unit', 'handoff:update': 'Update unit handoffs',
  'referral:create': 'Create referrals', 'referral:update': 'Update referrals',
  'register_entry:create': 'Add register entries', 'stock_movement:create': 'Record stock movements',
  'charge:create': 'Raise patient charges', 'payment:receive': 'Receive payments',
  'payment:waive': 'Discount or waive fees', 'payment:reverse': 'Reverse payments', 'payment:refund': 'Refund patient credits',
  'insurance_contract:read': 'Read payer contracts and tariffs', 'insurance_contract:manage': 'Edit payers, contracts and tariffs',
  'insurance_contract:activate': 'Activate payer contracts', 'cover:record': 'Record patient insurance cover', 'cover:verify': 'Record insurance cover checks',
  'coverage:elect_self_pay': 'Record a patient choosing to pay without insurance', 'coverage:confirm': 'Confirm insurance splits',
  'coverage:approve_liability_change': 'Approve making a patient liable for what a payer was expected to pay',
  'insurance_remittance:record': 'Record payments received from payers', 'billing:write_off': 'Write off amounts payers will not pay',
  'register_definition:publish': 'Configure registers', 'unit:manage': 'Manage units',
  'stock_item:manage': 'Manage stock items', 'fee_item:manage': 'Manage the fee schedule',
  'staff:manage': 'Add staff and edit names', 'staff:permission': 'Assign staff roles and permissions',
  'staff:deactivate': 'Remove staff access', 'roster:assign': 'Assign shifts',
  'roster:extend': 'Extend shifts', 'device:enroll': 'Enroll devices',
  'device:revoke': 'Revoke devices', 'sync_rejection:resolve': 'Resolve sync conflicts',
};
