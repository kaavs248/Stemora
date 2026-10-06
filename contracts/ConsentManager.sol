// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ConsentManager {

    enum ConsentStatus {
        ACTIVE,
        REVOKED
    }

    struct Consent {
        string consentId;
        string sampleId;
        string donorReference;
        string organization;
        string purpose;
        string usageType;
        uint256 validFrom;
        uint256 validUntil;
        ConsentStatus status;
        bytes32 restrictionsHash;
        uint256 updatedAt;
    }

    mapping(string => Consent) private consents;

    event ConsentCreated(
        string indexed consentId,
        string indexed sampleId,
        string organization,
        string purpose,
        uint256 validUntil,
        uint256 timestamp
    );

    event ConsentUpdated(
        string indexed consentId,
        uint256 timestamp
    );

    event ConsentRevoked(
        string indexed consentId,
        uint256 timestamp
    );

    function createConsent(
        string memory consentId,
        string memory sampleId,
        string memory donorReference,
        string memory organization,
        string memory purpose,
        string memory usageType,
        uint256 validFrom,
        uint256 validUntil,
        bytes32 restrictionsHash
    ) public {

        require(
            consents[consentId].updatedAt == 0,
            "Consent already exists"
        );

        require(
            bytes(consentId).length > 0,
            "Invalid consent ID"
        );

        require(
            bytes(sampleId).length > 0,
            "Invalid sample ID"
        );

        require(
            validUntil > validFrom,
            "Invalid validity period"
        );

        consents[consentId] = Consent({
            consentId: consentId,
            sampleId: sampleId,
            donorReference: donorReference,
            organization: organization,
            purpose: purpose,
            usageType: usageType,
            validFrom: validFrom,
            validUntil: validUntil,
            status: ConsentStatus.ACTIVE,
            restrictionsHash: restrictionsHash,
            updatedAt: block.timestamp
        });

        emit ConsentCreated(
            consentId,
            sampleId,
            organization,
            purpose,
            validUntil,
            block.timestamp
        );
    }

    function getConsent(
        string memory consentId
    )
        public
        view
        returns (
            string memory,
            string memory,
            string memory,
            string memory,
            string memory,
            string memory,
            uint256,
            uint256,
            ConsentStatus,
            bytes32,
            uint256
        )
    {
        require(
            consents[consentId].updatedAt != 0,
            "Consent does not exist"
        );

        Consent memory consent = consents[consentId];

        return (
            consent.consentId,
            consent.sampleId,
            consent.donorReference,
            consent.organization,
            consent.purpose,
            consent.usageType,
            consent.validFrom,
            consent.validUntil,
            consent.status,
            consent.restrictionsHash,
            consent.updatedAt
        );
    }

    function revokeConsent(
        string memory consentId
    ) public {

        require(
            consents[consentId].updatedAt != 0,
            "Consent does not exist"
        );

        Consent storage consent = consents[consentId];

        require(
            consent.status == ConsentStatus.ACTIVE,
            "Consent already revoked"
        );

        consent.status = ConsentStatus.REVOKED;
        consent.updatedAt = block.timestamp;

        emit ConsentRevoked(
            consentId,
            block.timestamp
        );
    }

    function isConsentActive(
        string memory consentId
    )
        public
        view
        returns (bool)
    {
        Consent storage consent = consents[consentId];

        if (consent.updatedAt == 0) {
            return false;
        }

        if (consent.status != ConsentStatus.ACTIVE) {
            return false;
        }

        if (block.timestamp < consent.validFrom) {
            return false;
        }

        if (block.timestamp > consent.validUntil) {
            return false;
        }

        return true;
    }
}