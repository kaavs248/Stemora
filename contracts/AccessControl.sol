// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IConsentManager {
    function getConsent(
        string memory consentId
    )
        external
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
            uint8,
            bytes32,
            uint256
        );

    function isConsentActive(
        string memory consentId
    ) external view returns (bool);
}

interface ISampleRegistry {
    function getSample(
        string memory sampleId
    )
        external
        view
        returns (
            string memory,
            string memory,
            uint8,
            uint256,
            uint256,
            address,
            bytes32
        );
}

contract AccessControl {

    IConsentManager public consentManager;
    ISampleRegistry public sampleRegistry;

    event AccessDecision(
        string indexed requestId,
        string indexed consentId,
        string indexed sampleId,
        address requester,
        bool granted,
        string reason,
        uint256 timestamp
    );

    constructor(
        address _consentManager,
        address _sampleRegistry
    ) {
        require(
            _consentManager != address(0),
            "Invalid consent manager"
        );

        require(
            _sampleRegistry != address(0),
            "Invalid sample registry"
        );

        consentManager = IConsentManager(_consentManager);
        sampleRegistry = ISampleRegistry(_sampleRegistry);
    }

    function checkAccess(
        string memory requestId,
        string memory consentId,
        string memory sampleId,
        string memory organization,
        string memory purpose
    )
        public
        returns (bool, string memory)
    {
        if (
            !consentManager.isConsentActive(consentId)
        ) {
            return _deny(
                requestId,
                consentId,
                sampleId,
                "Consent is not active"
            );
        }

        (
            ,
            string memory consentSampleId,
            ,
            string memory consentOrganization,
            string memory consentPurpose,
            ,
            ,
            ,
            ,
            ,
            
        ) = consentManager.getConsent(consentId);

        if (
            keccak256(bytes(consentSampleId)) !=
            keccak256(bytes(sampleId))
        ) {
            return _deny(
                requestId,
                consentId,
                sampleId,
                "Consent does not apply to sample"
            );
        }

        if (
            keccak256(bytes(consentOrganization)) !=
            keccak256(bytes(organization))
        ) {
            return _deny(
                requestId,
                consentId,
                sampleId,
                "Organization does not match consent"
            );
        }

        if (
            keccak256(bytes(consentPurpose)) !=
            keccak256(bytes(purpose))
        ) {
            return _deny(
                requestId,
                consentId,
                sampleId,
                "Purpose does not match consent"
            );
        }

        (
            ,
            ,
            uint8 sampleStatus,
            ,
            ,
            ,
            
        ) = sampleRegistry.getSample(sampleId);

        // STORED = 3
        if (sampleStatus != 3) {
            return _deny(
                requestId,
                consentId,
                sampleId,
                "Sample is not available"
            );
        }

        emit AccessDecision(
            requestId,
            consentId,
            sampleId,
            msg.sender,
            true,
            "Access granted",
            block.timestamp
        );

        return (true, "Access granted");
    }

    function _deny(
        string memory requestId,
        string memory consentId,
        string memory sampleId,
        string memory reason
    )
        internal
        returns (bool, string memory)
    {
        emit AccessDecision(
            requestId,
            consentId,
            sampleId,
            msg.sender,
            false,
            reason,
            block.timestamp
        );

        return (false, reason);
    }
}