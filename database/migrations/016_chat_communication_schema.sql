-- Migration 016: Internal Team Chat & Real-Time Communication Schema

-- 1. Chat Conversations Table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('direct', 'group', 'department', 'project') NOT NULL DEFAULT 'direct',
  title VARCHAR(255) NULL,
  description TEXT NULL,
  avatar_url VARCHAR(500) NULL,
  department_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  direct_user1_id BIGINT UNSIGNED NULL,
  direct_user2_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  last_message_id BIGINT UNSIGNED NULL,
  last_message_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_direct_pair (direct_user1_id, direct_user2_id),
  UNIQUE KEY unique_dept_conv (department_id),
  UNIQUE KEY unique_proj_conv (project_id),
  INDEX idx_chat_type (type),
  INDEX idx_chat_last_msg (last_message_at),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (direct_user1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (direct_user2_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Chat Conversation Members
CREATE TABLE IF NOT EXISTS chat_conversation_members (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_read_at TIMESTAMP NULL,
  is_muted TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY unique_conv_user (conversation_id, user_id),
  INDEX idx_chat_member_user (user_id),
  INDEX idx_chat_member_conv (conversation_id),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  message_type ENUM('text', 'file', 'image', 'system') NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  is_edited TINYINT(1) NOT NULL DEFAULT 0,
  edited_at TIMESTAMP NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_msg_conv (conversation_id),
  INDEX idx_chat_msg_sender (sender_id),
  INDEX idx_chat_msg_created (created_at),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Chat Attachments
CREATE TABLE IF NOT EXISTS chat_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size INT DEFAULT 0,
  mime_type VARCHAR(100) NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_attach_msg (message_id),
  INDEX idx_chat_attach_conv (conversation_id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Chat Message Reads (Read Receipts)
CREATE TABLE IF NOT EXISTS chat_message_reads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_msg_user_read (message_id, user_id),
  INDEX idx_chat_read_conv (conversation_id),
  INDEX idx_chat_read_user (user_id),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
