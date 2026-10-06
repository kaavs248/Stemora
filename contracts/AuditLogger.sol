// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditLogger {

    struct AuditEntry {
        uint256 id;
        string action;
        string subjectId;
        address actor;
        string detailsHash;
        uint256 timestamp;
    }

    uint256 private nextAuditId;

    mapping(uint256 => AuditEntry) private auditEntries;

    event AuditRecorded(
        uint256 indexed auditId,
        string action,
        string indexed subjectId,
        address indexed actor,
        string detailsHash,
        uint256 timestamp
    );

    constructor() {
        nextAuditId = 1;
    }

    function recordAudit(
        string memory action,
        string memory subjectId,
        string memory detailsHash
    ) public returns (uint256) {

        require(
            bytes(action).length > 0,
            "Invalid action"
        );

        require(
            bytes(subjectId).length > 0,
            "Invalid subject ID"
        );

        uint256 auditId = nextAuditId;

        auditEntries[auditId] = AuditEntry({
            id: auditId,
            action: action,
            subjectId: subjectId,
            actor: msg.sender,
            detailsHash: detailsHash,
            timestamp: block.timestamp
        });

        nextAuditId++;

        emit AuditRecorded(
            auditId,
            action,
            subjectId,
            msg.sender,
            detailsHash,
            block.timestamp
        );

        return auditId;
    }

    function getAudit(
        uint256 auditId
    )
        public
        view
        returns (
            uint256,
            string memory,
            string memory,
            address,
            string memory,
            uint256
        )
    {
        require(
            auditEntries[auditId].id != 0,
            "Audit entry does not exist"
        );

        AuditEntry memory entry =
            auditEntries[auditId];

        return (
            entry.id,
            entry.action,
            entry.subjectId,
            entry.actor,
            entry.detailsHash,
            entry.timestamp
        );
    }

    function getAuditCount()
        public
        view
        returns (uint256)
    {
        return nextAuditId - 1;
    }
}