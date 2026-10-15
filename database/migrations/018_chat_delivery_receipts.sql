-- Migration 018: Chat Delivery Receipts & Seen Time Tracking Schema

CREATE TABLE IF NOT EXISTS chat_message_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_msg_user_delivered (message_id, user_id),
  INDEX idx_chat_deliv_conv (conversation_id),
  INDEX idx_chat_deliv_user (user_id),
  INDEX idx_chat_deliv_msg (message_id),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill delivery for any existing read receipts
INSERT IGNORE INTO chat_message_deliveries (conversation_id, message_id, user_id, delivered_at)
SELECT conversation_id, message_id, user_id, read_at
FROM chat_message_reads;

-- Backfill sender delivery for existing messages
INSERT IGNORE INTO chat_message_deliveries (conversation_id, message_id, user_id, delivered_at)
SELECT conversation_id, id, sender_id, created_at
FROM chat_messages;
