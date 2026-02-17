-- ============================================
-- LEAD MONITORING AGENT - DATABASE SCHEMA
-- ============================================
-- Azure SQL Database
-- Production-grade schema with idempotency, audit trail, and recovery
-- ============================================

-- ============================================
-- TABLE 1: raw_leads
-- Purpose: Store raw Facebook webhook/API payloads for audit trail
-- Retention: Indefinite (archive after 90 days)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'raw_leads')
BEGIN
    CREATE TABLE raw_leads (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Facebook identifiers
        facebook_lead_id NVARCHAR(255) NOT NULL UNIQUE, -- Primary dedup key
        facebook_form_id NVARCHAR(255) NOT NULL,
        facebook_page_id NVARCHAR(255) NOT NULL,
        facebook_ad_id NVARCHAR(255) NULL,
        facebook_adset_id NVARCHAR(255) NULL,
        facebook_campaign_id NVARCHAR(255) NULL,

        -- Raw payload
        raw_payload NVARCHAR(MAX) NOT NULL, -- Full JSON from Facebook

        -- Ingestion metadata
        source NVARCHAR(50) NOT NULL, -- 'webhook' or 'polling'
        received_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        signature_valid BIT NULL, -- NULL for polling, TRUE/FALSE for webhook
        ip_address NVARCHAR(50) NULL, -- Source IP if webhook

        -- Processing status
        processed BIT NOT NULL DEFAULT 0,
        processed_at DATETIME2 NULL,
        processing_error NVARCHAR(MAX) NULL,

        -- Audit
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        INDEX idx_facebook_lead_id (facebook_lead_id),
        INDEX idx_received_at (received_at DESC),
        INDEX idx_processed (processed, received_at),
        INDEX idx_form_id (facebook_form_id, received_at DESC)
    );
END;

-- ============================================
-- TABLE 2: leads
-- Purpose: Normalized, business-usable lead data
-- This is the table your CRM/agents query
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'leads')
BEGIN
    CREATE TABLE leads (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Foreign key to raw data
        raw_lead_id BIGINT NOT NULL,
        facebook_lead_id NVARCHAR(255) NOT NULL UNIQUE, -- Dedup key

        -- Lead information (normalized from form fields)
        full_name NVARCHAR(255) NULL,
        first_name NVARCHAR(255) NULL,
        last_name NVARCHAR(255) NULL,
        email NVARCHAR(255) NULL,
        phone NVARCHAR(50) NULL,

        -- HOA-specific fields
        hoa_name NVARCHAR(500) NULL,
        project_type NVARCHAR(255) NULL,
        project_description NVARCHAR(MAX) NULL,
        estimated_budget DECIMAL(18,2) NULL,
        timeline NVARCHAR(255) NULL,

        -- Custom fields (JSON for flexibility)
        custom_fields NVARCHAR(MAX) NULL, -- JSON object

        -- Campaign tracking
        form_name NVARCHAR(500) NULL,
        ad_name NVARCHAR(500) NULL,
        campaign_name NVARCHAR(500) NULL,

        -- Lead metadata
        created_time DATETIME2 NULL, -- When lead submitted (from Facebook)
        ingested_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(), -- When we saved it

        -- Lead status (for follow-up tracking)
        status NVARCHAR(50) NOT NULL DEFAULT 'new', -- new, contacted, qualified, converted, lost
        assigned_to NVARCHAR(255) NULL,
        last_contacted_at DATETIME2 NULL,
        notes NVARCHAR(MAX) NULL,

        -- Audit
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT fk_raw_lead FOREIGN KEY (raw_lead_id) REFERENCES raw_leads(id),

        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_status (status, created_at DESC),
        INDEX idx_created_time (created_time DESC),
        INDEX idx_ingested_at (ingested_at DESC)
    );
END;

-- ============================================
-- TABLE 3: ingestion_state
-- Purpose: Track polling checkpoints and reconciliation state
-- Critical for recovery after downtime
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ingestion_state')
BEGIN
    CREATE TABLE ingestion_state (
        id INT IDENTITY(1,1) PRIMARY KEY,

        -- State type
        state_key NVARCHAR(100) NOT NULL UNIQUE, -- e.g., 'last_poll_timestamp', 'reconciliation_checkpoint'

        -- State value
        state_value NVARCHAR(MAX) NOT NULL, -- Could be timestamp, JSON, or counter

        -- Metadata
        description NVARCHAR(500) NULL,

        -- Audit
        updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        updated_by NVARCHAR(100) NULL, -- 'webhook', 'polling', 'admin'

        INDEX idx_state_key (state_key)
    );

    -- Initialize default state
    INSERT INTO ingestion_state (state_key, state_value, description, updated_by)
    VALUES
        ('last_poll_timestamp', CONVERT(NVARCHAR(50), DATEADD(day, -1, GETUTCDATE()), 127), 'Last successful polling timestamp', 'system'),
        ('last_reconciliation', CONVERT(NVARCHAR(50), GETUTCDATE(), 127), 'Last full reconciliation run', 'system'),
        ('total_leads_ingested', '0', 'Lifetime lead count', 'system'),
        ('webhook_enabled', 'true', 'Whether webhook ingestion is active', 'system'),
        ('polling_enabled', 'true', 'Whether polling fallback is active', 'system');
END;

-- ============================================
-- TABLE 4: notification_log
-- Purpose: Track all notifications sent (prevent duplicates)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'notification_log')
BEGIN
    CREATE TABLE notification_log (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- What was notified
        lead_id BIGINT NULL, -- NULL for digest/system notifications
        facebook_lead_id NVARCHAR(255) NULL,

        -- Notification details
        notification_type NVARCHAR(50) NOT NULL, -- 'instant', 'digest', 'failure_alert'
        recipient NVARCHAR(255) NOT NULL, -- Email address
        subject NVARCHAR(500) NULL,
        body_preview NVARCHAR(1000) NULL, -- First 1000 chars

        -- Delivery status
        status NVARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed
        sent_at DATETIME2 NULL,
        error_message NVARCHAR(MAX) NULL,
        retry_count INT NOT NULL DEFAULT 0,
        last_retry_at DATETIME2 NULL,

        -- Audit
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT fk_notification_lead FOREIGN KEY (lead_id) REFERENCES leads(id),

        INDEX idx_lead_id (lead_id),
        INDEX idx_status (status, created_at),
        INDEX idx_notification_type (notification_type, created_at DESC)
    );
END;

-- ============================================
-- TABLE 5: errors_deadletter
-- Purpose: Store failed events for manual review and replay
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'errors_deadletter')
BEGIN
    CREATE TABLE errors_deadletter (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Error context
        error_type NVARCHAR(100) NOT NULL, -- 'validation_failed', 'db_insert_failed', 'notification_failed'
        source NVARCHAR(50) NOT NULL, -- 'webhook', 'polling', 'notification'

        -- Failed data
        payload NVARCHAR(MAX) NOT NULL, -- Original event/data
        facebook_lead_id NVARCHAR(255) NULL, -- If identifiable

        -- Error details
        error_message NVARCHAR(MAX) NOT NULL,
        stack_trace NVARCHAR(MAX) NULL,

        -- Retry status
        reprocessed BIT NOT NULL DEFAULT 0,
        reprocessed_at DATETIME2 NULL,
        reprocess_result NVARCHAR(MAX) NULL,

        -- Audit
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        INDEX idx_error_type (error_type, created_at DESC),
        INDEX idx_reprocessed (reprocessed, created_at),
        INDEX idx_facebook_lead_id (facebook_lead_id)
    );
END;

-- ============================================
-- TABLE 6: agent_activity_log
-- Purpose: Audit trail of all agent actions
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_activity_log')
BEGIN
    CREATE TABLE agent_activity_log (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Activity details
        activity_type NVARCHAR(100) NOT NULL, -- 'lead_ingested', 'notification_sent', 'reconciliation_run', 'error_logged'
        description NVARCHAR(1000) NULL,

        -- Related entities
        lead_id BIGINT NULL,
        facebook_lead_id NVARCHAR(255) NULL,

        -- Context
        source NVARCHAR(50) NULL, -- 'webhook', 'polling', 'admin'
        metadata NVARCHAR(MAX) NULL, -- JSON for additional context

        -- Result
        success BIT NOT NULL DEFAULT 1,
        error_message NVARCHAR(MAX) NULL,

        -- Performance
        duration_ms INT NULL, -- How long the action took

        -- Audit
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

        INDEX idx_activity_type (activity_type, created_at DESC),
        INDEX idx_created_at (created_at DESC),
        INDEX idx_success (success, created_at)
    );
END;

-- ============================================
-- STORED PROCEDURE: Upsert Lead (Idempotent)
-- ============================================
IF OBJECT_ID('sp_upsert_lead', 'P') IS NOT NULL
    DROP PROCEDURE sp_upsert_lead;
GO

CREATE PROCEDURE sp_upsert_lead
    @facebook_lead_id NVARCHAR(255),
    @facebook_form_id NVARCHAR(255),
    @facebook_page_id NVARCHAR(255),
    @raw_payload NVARCHAR(MAX),
    @source NVARCHAR(50),
    @signature_valid BIT = NULL,
    @ip_address NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Check if lead already exists
        IF NOT EXISTS (SELECT 1 FROM raw_leads WHERE facebook_lead_id = @facebook_lead_id)
        BEGIN
            -- Insert raw lead
            INSERT INTO raw_leads (
                facebook_lead_id, facebook_form_id, facebook_page_id,
                raw_payload, source, signature_valid, ip_address
            )
            VALUES (
                @facebook_lead_id, @facebook_form_id, @facebook_page_id,
                @raw_payload, @source, @signature_valid, @ip_address
            );

            -- Log activity
            INSERT INTO agent_activity_log (activity_type, facebook_lead_id, source, success)
            VALUES ('lead_ingested', @facebook_lead_id, @source, 1);

            -- Update counter
            UPDATE ingestion_state
            SET state_value = CAST(CAST(state_value AS INT) + 1 AS NVARCHAR(50)),
                updated_at = GETUTCDATE()
            WHERE state_key = 'total_leads_ingested';
        END
        ELSE
        BEGIN
            -- Log duplicate (informational, not an error)
            INSERT INTO agent_activity_log (activity_type, facebook_lead_id, source, success, description)
            VALUES ('lead_duplicate', @facebook_lead_id, @source, 1, 'Lead already exists (idempotent behavior)');
        END

        COMMIT TRANSACTION;

        -- Return the lead ID (existing or new)
        SELECT id, facebook_lead_id, processed
        FROM raw_leads
        WHERE facebook_lead_id = @facebook_lead_id;

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;

        -- Log to dead letter queue
        INSERT INTO errors_deadletter (error_type, source, payload, facebook_lead_id, error_message)
        VALUES ('db_insert_failed', @source, @raw_payload, @facebook_lead_id, ERROR_MESSAGE());

        THROW;
    END CATCH;
END;
GO

-- ============================================
-- STORED PROCEDURE: Update Polling Checkpoint
-- ============================================
IF OBJECT_ID('sp_update_checkpoint', 'P') IS NOT NULL
    DROP PROCEDURE sp_update_checkpoint;
GO

CREATE PROCEDURE sp_update_checkpoint
    @timestamp DATETIME2
AS
BEGIN
    UPDATE ingestion_state
    SET state_value = CONVERT(NVARCHAR(50), @timestamp, 127),
        updated_at = GETUTCDATE(),
        updated_by = 'polling'
    WHERE state_key = 'last_poll_timestamp';

    SELECT state_value FROM ingestion_state WHERE state_key = 'last_poll_timestamp';
END;
GO

-- ============================================
-- VIEW: Lead Summary Stats
-- ============================================
IF OBJECT_ID('v_lead_stats', 'V') IS NOT NULL
    DROP VIEW v_lead_stats;
GO

CREATE VIEW v_lead_stats AS
SELECT
    COUNT(*) as total_leads,
    COUNT(CASE WHEN source = 'webhook' THEN 1 END) as webhook_leads,
    COUNT(CASE WHEN source = 'polling' THEN 1 END) as polling_leads,
    COUNT(CASE WHEN processed = 1 THEN 1 END) as processed_leads,
    COUNT(CASE WHEN processed = 0 THEN 1 END) as pending_leads,
    MIN(received_at) as first_lead_at,
    MAX(received_at) as last_lead_at,
    COUNT(CASE WHEN received_at > DATEADD(day, -1, GETUTCDATE()) THEN 1 END) as leads_last_24h,
    COUNT(CASE WHEN received_at > DATEADD(hour, -1, GETUTCDATE()) THEN 1 END) as leads_last_hour
FROM raw_leads;
GO

PRINT 'Lead Monitoring Agent schema created successfully!';
PRINT 'Tables: raw_leads, leads, ingestion_state, notification_log, errors_deadletter, agent_activity_log';
PRINT 'Procedures: sp_upsert_lead, sp_update_checkpoint';
PRINT 'Views: v_lead_stats';
