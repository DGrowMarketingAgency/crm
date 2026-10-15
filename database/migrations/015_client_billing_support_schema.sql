-- Migration 015: Client Support Tickets, Quotations, Invoices, and Payment Tracking Schema

-- 1. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  service_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  assigned_to BIGINT UNSIGNED NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'General Support',
  priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'assigned', 'in_progress', 'waiting_client', 'waiting_internal', 'resolved', 'closed', 'reopened') NOT NULL DEFAULT 'open',
  description TEXT NOT NULL,
  resolved_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_client (client_id),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_assigned (assigned_to),
  INDEX idx_tickets_created_at (created_at),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES service_instances(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ticket Messages (Conversations & Internal Notes)
CREATE TABLE IF NOT EXISTS ticket_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  message_type ENUM('reply', 'internal_note', 'status_change') NOT NULL DEFAULT 'reply',
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_msg_ticket (ticket_id),
  INDEX idx_ticket_msg_type (message_type),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ticket Attachments
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size INT DEFAULT 0,
  mime_type VARCHAR(100) NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_attach_ticket (ticket_id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES ticket_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Quotations Table
CREATE TABLE IF NOT EXISTS quotations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_number VARCHAR(50) NOT NULL UNIQUE,
  version_number INT NOT NULL DEFAULT 1,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  service_id BIGINT UNSIGNED NULL,
  prepared_by BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted') NOT NULL DEFAULT 'draft',
  quotation_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  terms_and_conditions TEXT NULL,
  notes TEXT NULL,
  client_decision_by BIGINT UNSIGNED NULL,
  client_decision_at TIMESTAMP NULL,
  client_rejection_reason TEXT NULL,
  converted_invoice_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_quot_client (client_id),
  INDEX idx_quot_status (status),
  INDEX idx_quot_date (quotation_date),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES service_instances(id) ON DELETE SET NULL,
  FOREIGN KEY (prepared_by) REFERENCES users(id),
  FOREIGN KEY (client_decision_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Quotation Line Items
CREATE TABLE IF NOT EXISTS quotation_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id BIGINT UNSIGNED NOT NULL,
  item_description VARCHAR(500) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_quot_items_quot (quotation_id),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  client_id BIGINT UNSIGNED NOT NULL,
  quotation_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  service_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  status ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void') NOT NULL DEFAULT 'draft',
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  outstanding_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  payment_terms VARCHAR(255) NULL,
  notes TEXT NULL,
  issued_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inv_client (client_id),
  INDEX idx_inv_status (status),
  INDEX idx_inv_date (invoice_date),
  INDEX idx_inv_due (due_date),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES service_instances(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  item_description VARCHAR(500) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_inv_items_inv (invoice_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_reference VARCHAR(50) NOT NULL UNIQUE,
  invoice_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method ENUM('bank_transfer', 'upi', 'cash', 'card', 'payment_gateway', 'other') NOT NULL DEFAULT 'bank_transfer',
  transaction_reference VARCHAR(100) NULL,
  payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'completed',
  recorded_by BIGINT UNSIGNED NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pay_invoice (invoice_id),
  INDEX idx_pay_client (client_id),
  INDEX idx_pay_status (payment_status),
  INDEX idx_pay_date (payment_date),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
