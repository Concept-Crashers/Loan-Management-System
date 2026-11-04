import type { Application, CollectionRecord, Customer, LoanAccount, LoanProduct, Repayment, ScheduleInstallment, StaffMember, Transaction } from '../lib/types'

export const customers: Customer[] = [
  { id: 'CUS-2481', name: 'Anita Namusoke', phone: '+256 772 418 609', email: 'anita.namusoke@email.com', district: 'Kampala', town: 'Ntinda', loans: 2, outstanding: 1840000, status: 'Active', registered: '2026-08-12', nationalId: 'CM9200810A4PL', occupation: 'Retail business owner', employer: 'Namusoke Stores', monthlyIncome: 1250000, nextOfKin: 'Moses Namusoke', nextOfKinPhone: '+256 701 228 493', address: 'Ntinda, Nakawa Division, Kampala' },
  { id: 'CUS-2479', name: 'David Mugisha', phone: '+256 704 215 738', email: 'd.mugisha@email.com', district: 'Wakiso', town: 'Entebbe', loans: 1, outstanding: 3200000, status: 'Active', registered: '2026-08-09', nationalId: 'CM87011509H4Q', occupation: 'Teacher', employer: 'Entebbe Primary School', monthlyIncome: 2100000, nextOfKin: 'Grace Mugisha', nextOfKinPhone: '+256 782 901 144', address: 'Kitoro, Entebbe Municipality' },
  { id: 'CUS-2474', name: 'Sarah Atwine', phone: '+256 759 346 102', email: 'sarah.atwine@email.com', district: 'Mbarara', town: 'Mbarara City', loans: 1, outstanding: 960000, status: 'Active', registered: '2026-07-28', nationalId: 'CF91023706V4C', occupation: 'Salon owner', employer: 'Self-employed', monthlyIncome: 980000, nextOfKin: 'Paul Atwine', nextOfKinPhone: '+256 772 532 885', address: 'Kakoba, Mbarara City' },
  { id: 'CUS-2468', name: 'Brian Okello', phone: '+256 782 601 422', email: 'brian.okello@email.com', district: 'Gulu', town: 'Pece', loans: 3, outstanding: 0, status: 'Active', registered: '2026-07-22', nationalId: 'CM890511018XY', occupation: 'Produce trader', employer: 'Okello Produce', monthlyIncome: 1600000, nextOfKin: 'Agnes Okello', nextOfKinPhone: '+256 755 114 281', address: 'Pece, Gulu City' },
  { id: 'CUS-2462', name: 'Josephine Nakitto', phone: '+256 771 449 890', email: 'j.nakitto@email.com', district: 'Jinja', town: 'Walukuba', loans: 1, outstanding: 780000, status: 'Watchlist', registered: '2026-07-18', nationalId: 'CF940509003MT', occupation: 'Tailor', employer: 'Nakitto Fashion', monthlyIncome: 740000, nextOfKin: 'Peter Nakitto', nextOfKinPhone: '+256 703 663 813', address: 'Walukuba, Jinja City' },
  { id: 'CUS-2455', name: 'Patrick Ssemanda', phone: '+256 703 912 075', email: 'p.ssemanda@email.com', district: 'Mukono', town: 'Mukono', loans: 2, outstanding: 2430000, status: 'Active', registered: '2026-07-10', nationalId: 'CM85021902M1B', occupation: 'Boda boda operator', employer: 'Self-employed', monthlyIncome: 1100000, nextOfKin: 'Ruth Ssemanda', nextOfKinPhone: '+256 772 331 054', address: 'Seeta, Mukono District' },
  { id: 'CUS-2448', name: 'Grace Akello', phone: '+256 752 826 118', email: 'grace.akello@email.com', district: 'Lira', town: 'Lira City', loans: 0, outstanding: 0, status: 'Active', registered: '2026-07-04', nationalId: 'CF96031406D12', occupation: 'Pharmacist', employer: 'Lira Health Centre', monthlyIncome: 1850000, nextOfKin: 'Daniel Akello', nextOfKinPhone: '+256 785 420 079', address: 'Railways, Lira City' },
  { id: 'CUS-2432', name: 'Michael Kato', phone: '+256 772 510 337', email: 'm.kato@email.com', district: 'Kampala', town: 'Kawempe', loans: 1, outstanding: 5100000, status: 'Active', registered: '2026-06-26', nationalId: 'CM88072302R5K', occupation: 'Hardware shop owner', employer: 'Kato Hardware', monthlyIncome: 2750000, nextOfKin: 'Lydia Kato', nextOfKinPhone: '+256 700 856 228', address: 'Kawempe, Kampala' },
]

export const products: LoanProduct[] = [
  { id: 'PRD-001', name: 'Business Growth', description: 'Flexible working capital for established micro businesses.', minAmount: 500000, maxAmount: 15000000, interestRate: 18, duration: 12, frequency: 'Monthly', active: true },
  { id: 'PRD-002', name: 'Salary Advance', description: 'Short-term financing linked to verifiable monthly income.', minAmount: 200000, maxAmount: 5000000, interestRate: 12, duration: 6, frequency: 'Monthly', active: true },
  { id: 'PRD-003', name: 'Emergency Assist', description: 'Responsive support for urgent and unplanned expenses.', minAmount: 100000, maxAmount: 2000000, interestRate: 15, duration: 3, frequency: 'Monthly', active: true },
  { id: 'PRD-004', name: 'Group Enterprise', description: 'Shared responsibility lending for verified member groups.', minAmount: 1000000, maxAmount: 25000000, interestRate: 16, duration: 18, frequency: 'Monthly', active: true },
]

export const applications: Application[] = [
  { id: 'APP-2026-0314', customer: 'Anita Namusoke', customerId: 'CUS-2481', product: 'Business Growth', amount: 4500000, duration: 12, status: 'Under Review', submitted: '2026-11-04', income: 1250000, officer: 'Peter Ssebuliba', purpose: 'Restock fast-moving household items', obligations: 180000 },
  { id: 'APP-2026-0313', customer: 'Grace Akello', customerId: 'CUS-2448', product: 'Salary Advance', amount: 2500000, duration: 6, status: 'Submitted', submitted: '2026-11-03', income: 1850000, officer: 'Miriam Nakato', purpose: 'Home improvement', obligations: 300000 },
  { id: 'APP-2026-0311', customer: 'Isaac Ocen', customerId: 'CUS-2411', product: 'Emergency Assist', amount: 800000, duration: 3, status: 'Additional Information Required', submitted: '2026-11-02', income: 650000, officer: 'Peter Ssebuliba', purpose: 'Medical costs', obligations: 120000 },
  { id: 'APP-2026-0308', customer: 'Beatrice Nansubuga', customerId: 'CUS-2398', product: 'Business Growth', amount: 6200000, duration: 12, status: 'Approved', submitted: '2026-10-31', income: 2200000, officer: 'Sarah Kiconco', purpose: 'Expand produce stall', obligations: 250000 },
  { id: 'APP-2026-0301', customer: 'Daniel Byaruhanga', customerId: 'CUS-2387', product: 'Group Enterprise', amount: 9000000, duration: 18, status: 'Rejected', submitted: '2026-10-28', income: 1100000, officer: 'Miriam Nakato', purpose: 'Farm inputs', obligations: 600000 },
]

export const loans: LoanAccount[] = [
  { ref: 'LN-2026-0128', customer: 'Anita Namusoke', customerId: 'CUS-2481', product: 'Business Growth', principal: 5000000, disbursed: 5000000, paid: 3160000, outstanding: 1840000, interest: 280000, start: '2026-07-01', maturity: '2027-06-01', status: 'Active', nextDue: '2026-11-12' },
  { ref: 'LN-2026-0126', customer: 'David Mugisha', customerId: 'CUS-2479', product: 'Salary Advance', principal: 4000000, disbursed: 4000000, paid: 800000, outstanding: 3200000, interest: 190000, start: '2026-09-05', maturity: '2027-03-05', status: 'Active', nextDue: '2026-11-05' },
  { ref: 'LN-2026-0122', customer: 'Sarah Atwine', customerId: 'CUS-2474', product: 'Business Growth', principal: 2500000, disbursed: 2500000, paid: 1540000, outstanding: 960000, interest: 160000, start: '2026-07-18', maturity: '2027-07-18', status: 'Active', nextDue: '2026-11-18' },
  { ref: 'LN-2026-0118', customer: 'Brian Okello', customerId: 'CUS-2468', product: 'Emergency Assist', principal: 1200000, disbursed: 1200000, paid: 1320000, outstanding: 0, interest: 120000, start: '2026-04-12', maturity: '2026-10-12', status: 'Fully Paid', nextDue: '—' },
  { ref: 'LN-2026-0114', customer: 'Josephine Nakitto', customerId: 'CUS-2462', product: 'Salary Advance', principal: 1800000, disbursed: 1800000, paid: 1020000, outstanding: 780000, interest: 95000, start: '2026-08-15', maturity: '2027-02-15', status: 'Overdue', nextDue: '2026-10-15' },
  { ref: 'LN-2026-0109', customer: 'Patrick Ssemanda', customerId: 'CUS-2455', product: 'Business Growth', principal: 6000000, disbursed: 6000000, paid: 3570000, outstanding: 2430000, interest: 390000, start: '2026-05-21', maturity: '2027-05-21', status: 'Active', nextDue: '2026-11-21' },
  { ref: 'LN-2026-0102', customer: 'Michael Kato', customerId: 'CUS-2432', product: 'Business Growth', principal: 8000000, disbursed: 8000000, paid: 2900000, outstanding: 5100000, interest: 520000, start: '2026-03-11', maturity: '2027-03-11', status: 'Active', nextDue: '2026-11-11' },
  { ref: 'LN-2026-0094', customer: 'Beatrice Nansubuga', customerId: 'CUS-2398', product: 'Group Enterprise', principal: 9000000, disbursed: 9000000, paid: 900000, outstanding: 8100000, interest: 400000, start: '2026-10-31', maturity: '2028-04-30', status: 'Pending Disbursement', nextDue: '—' },
]

export const repayments: Repayment[] = [
  { id: 'RCT-2026-0841', customer: 'Anita Namusoke', customerId: 'CUS-2481', loan: 'LN-2026-0128', amount: 420000, method: 'MTN Mobile Money', reference: 'MP260304.1814.A4102', date: '2026-11-04', receivedBy: 'Paul Wekesa', status: 'Successful' },
  { id: 'RCT-2026-0840', customer: 'Brian Okello', customerId: 'CUS-2468', loan: 'LN-2026-0118', amount: 220000, method: 'Airtel Money', reference: 'AMN-41502872', date: '2026-11-04', receivedBy: 'Rita Acen', status: 'Successful' },
  { id: 'RCT-2026-0839', customer: 'David Mugisha', customerId: 'CUS-2479', loan: 'LN-2026-0126', amount: 600000, method: 'Bank transfer', reference: 'STANBIC-44371', date: '2026-11-03', receivedBy: 'Paul Wekesa', status: 'Successful' },
  { id: 'RCT-2026-0838', customer: 'Sarah Atwine', customerId: 'CUS-2474', loan: 'LN-2026-0122', amount: 340000, method: 'Cash', reference: 'CASH-00391', date: '2026-11-03', receivedBy: 'Rita Acen', status: 'Successful' },
  { id: 'RCT-2026-0837', customer: 'Patrick Ssemanda', customerId: 'CUS-2455', loan: 'LN-2026-0109', amount: 500000, method: 'MTN Mobile Money', reference: 'MP260303.0922.B8391', date: '2026-11-02', receivedBy: 'Paul Wekesa', status: 'Pending review' },
  { id: 'RCT-2026-0836', customer: 'Grace Akello', customerId: 'CUS-2448', loan: 'LN-2026-0101', amount: 250000, method: 'Airtel Money', reference: 'AMN-41488702', date: '2026-11-02', receivedBy: 'Rita Acen', status: 'Successful' },
]

export const schedules: ScheduleInstallment[] = [
  { id: 'SCH-9128-05', customer: 'Anita Namusoke', loan: 'LN-2026-0128', due: '2026-11-12', expected: 520000, paid: 0, status: 'Upcoming', officer: 'Peter Ssebuliba' },
  { id: 'SCH-9126-03', customer: 'David Mugisha', loan: 'LN-2026-0126', due: '2026-11-05', expected: 690000, paid: 0, status: 'Due soon', officer: 'Miriam Nakato' },
  { id: 'SCH-9122-05', customer: 'Sarah Atwine', loan: 'LN-2026-0122', due: '2026-11-18', expected: 280000, paid: 0, status: 'Upcoming', officer: 'Peter Ssebuliba' },
  { id: 'SCH-9114-04', customer: 'Josephine Nakitto', loan: 'LN-2026-0114', due: '2026-10-15', expected: 320000, paid: 0, status: 'Overdue', officer: 'Sarah Kiconco' },
  { id: 'SCH-9109-07', customer: 'Patrick Ssemanda', loan: 'LN-2026-0109', due: '2026-11-21', expected: 570000, paid: 0, status: 'Upcoming', officer: 'Miriam Nakato' },
  { id: 'SCH-9118-06', customer: 'Brian Okello', loan: 'LN-2026-0118', due: '2026-10-12', expected: 220000, paid: 220000, status: 'Paid', officer: 'Peter Ssebuliba' },
]

export const collections: CollectionRecord[] = [
  { id: 'COL-0882', customer: 'Josephine Nakitto', phone: '+256 771 449 890', loan: 'LN-2026-0114', outstanding: 780000, overdue: 320000, lastPayment: '2026-09-15', followUp: '2026-11-05', officer: 'Sarah Kiconco', status: 'Awaiting Response', note: 'Customer requested a call after 4:00 PM.' },
  { id: 'COL-0881', customer: 'David Mugisha', phone: '+256 704 215 738', loan: 'LN-2026-0126', outstanding: 3200000, overdue: 0, lastPayment: '2026-10-05', followUp: '2026-11-06', officer: 'Miriam Nakato', status: 'Contacted', note: 'Reminder shared; due date is 5 Nov.' },
  { id: 'COL-0875', customer: 'Michael Kato', phone: '+256 772 510 337', loan: 'LN-2026-0102', outstanding: 5100000, overdue: 0, lastPayment: '2026-10-11', followUp: '2026-11-07', officer: 'Peter Ssebuliba', status: 'Payment Arrangement Recorded', note: 'Customer proposed two smaller payments.' },
  { id: 'COL-0863', customer: 'Patrick Ssemanda', phone: '+256 703 912 075', loan: 'LN-2026-0109', outstanding: 2430000, overdue: 0, lastPayment: '2026-10-21', followUp: '2026-11-08', officer: 'Miriam Nakato', status: 'Not Contacted', note: 'Routine due-date check-in.' },
]

export const transactions: Transaction[] = [
  { id: 'TXN-00714', type: 'Repayment', reference: 'RCT-2026-0841', customer: 'Anita Namusoke', amount: 420000, date: '2026-11-04', method: 'MTN Mobile Money', status: 'Completed', recordedBy: 'Paul Wekesa' },
  { id: 'TXN-00713', type: 'Repayment', reference: 'RCT-2026-0840', customer: 'Brian Okello', amount: 220000, date: '2026-11-04', method: 'Airtel Money', status: 'Completed', recordedBy: 'Rita Acen' },
  { id: 'TXN-00712', type: 'Disbursement', reference: 'LN-2026-0128', customer: 'Anita Namusoke', amount: 5000000, date: '2026-11-03', method: 'Bank transfer', status: 'Completed', recordedBy: 'Paul Wekesa' },
  { id: 'TXN-00711', type: 'Repayment', reference: 'RCT-2026-0839', customer: 'David Mugisha', amount: 600000, date: '2026-11-03', method: 'Bank transfer', status: 'Completed', recordedBy: 'Paul Wekesa' },
  { id: 'TXN-00710', type: 'Disbursement', reference: 'LN-2026-0126', customer: 'David Mugisha', amount: 4000000, date: '2026-11-01', method: 'Bank transfer', status: 'Completed', recordedBy: 'Rita Acen' },
]

export const staff: StaffMember[] = [
  { id: 'USR-001', name: 'Sarah Kiconco', email: 'sarah.kiconco@lendflow.ug', phone: '+256 772 118 401', role: 'Manager', branch: 'Kampala Central', status: 'Active', lastActive: 'Now' },
  { id: 'USR-002', name: 'Peter Ssebuliba', email: 'peter.ssebuliba@lendflow.ug', phone: '+256 701 489 265', role: 'Loan Officer', branch: 'Kampala Central', status: 'Active', lastActive: '12 minutes ago' },
  { id: 'USR-003', name: 'Miriam Nakato', email: 'miriam.nakato@lendflow.ug', phone: '+256 772 912 044', role: 'Credit Officer', branch: 'Entebbe', status: 'Active', lastActive: '36 minutes ago' },
  { id: 'USR-004', name: 'Paul Wekesa', email: 'paul.wekesa@lendflow.ug', phone: '+256 759 401 224', role: 'Cashier', branch: 'Kampala Central', status: 'Active', lastActive: '1 hour ago' },
  { id: 'USR-005', name: 'Rita Acen', email: 'rita.acen@lendflow.ug', phone: '+256 782 330 871', role: 'Accountant', branch: 'Gulu', status: 'Invited', lastActive: '—' },
]
