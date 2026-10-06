// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IAccessRoles {
    function hasRole(
        bytes32 role,
        address account
    ) external view returns (bool);

    function BANK_OPERATOR_ROLE()
        external
        view
        returns (bytes32);
}
contract SampleRegistry {
    IAccessRoles public accessRoles;
    constructor(address _accessRoles) {
    require(
        _accessRoles != address(0),
        "Invalid access roles"
    );

    accessRoles = IAccessRoles(_accessRoles);
}
modifier onlyBankOperator() {
    require(
        accessRoles.hasRole(
            accessRoles.BANK_OPERATOR_ROLE(),
            msg.sender
        ),
        "Not bank operator"
    );
    _;
}
    enum SampleStatus {
        COLLECTED,
        PROCESSING,
        TESTING,
        STORED,
        TRANSFERRED,
        RELEASED,
        DESTROYED
    }
    

    struct Sample {
        string sampleId;
        string donorReference;
        SampleStatus status;
        uint256 registeredAt;
        uint256 updatedAt;
        address custodian;
        bytes32 metadataHash;
    }

    mapping(string => Sample) private samples;

    event SampleRegistered(
        string indexed sampleId,
        string donorReference,
        address indexed custodian,
        uint256 timestamp
    );

    event SampleStatusChanged(
        string indexed sampleId,
        SampleStatus oldStatus,
        SampleStatus newStatus,
        uint256 timestamp
    );

    event SampleCustodianChanged(
        string indexed sampleId,
        address indexed oldCustodian,
        address indexed newCustodian,
        uint256 timestamp
    );

    function registerSample(
        string memory sampleId,
        string memory donorReference,
        bytes32 metadataHash
    )public onlyBankOperator{

        require(
            samples[sampleId].registeredAt == 0,
            "Sample already exists"
        );

        samples[sampleId] = Sample({
            sampleId: sampleId,
            donorReference: donorReference,
            status: SampleStatus.COLLECTED,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp,
            custodian: msg.sender,
            metadataHash: metadataHash
        });

        emit SampleRegistered(
            sampleId,
            donorReference,
            msg.sender,
            block.timestamp
        );
    }

    function getSample(
        string memory sampleId
    )
        public
        view
        returns (
            string memory,
            string memory,
            SampleStatus,
            uint256,
            uint256,
            address,
            bytes32
        )
    {
        require(
            samples[sampleId].registeredAt != 0,
            "Sample does not exist"
        );

        Sample memory sample = samples[sampleId];

        return (
            sample.sampleId,
            sample.donorReference,
            sample.status,
            sample.registeredAt,
            sample.updatedAt,
            sample.custodian,
            sample.metadataHash
        );
    }

    function updateStatus(
    string memory sampleId,
    SampleStatus newStatus
) public onlyBankOperator {

        require(
            samples[sampleId].registeredAt != 0,
            "Sample does not exist"
        );

        Sample storage sample = samples[sampleId];

        require(
            msg.sender == sample.custodian,
            "Not authorized"
        );

        require(
            isValidTransition(sample.status, newStatus),
            "Invalid lifecycle transition"
        );

        SampleStatus oldStatus = sample.status;

        sample.status = newStatus;
        sample.updatedAt = block.timestamp;

        emit SampleStatusChanged(
            sampleId,
            oldStatus,
            newStatus,
            block.timestamp
        );
    }

    function transferCustody(
    string memory sampleId,
    address newCustodian
) public onlyBankOperator {

        require(
            samples[sampleId].registeredAt != 0,
            "Sample does not exist"
        );

        Sample storage sample = samples[sampleId];

        require(
            msg.sender == sample.custodian,
            "Not authorized"
        );

        require(
            newCustodian != address(0),
            "Invalid custodian"
        );

        address oldCustodian = sample.custodian;

        sample.custodian = newCustodian;
        sample.updatedAt = block.timestamp;

        emit SampleCustodianChanged(
            sampleId,
            oldCustodian,
            newCustodian,
            block.timestamp
        );
    }

    function isValidTransition(
        SampleStatus currentStatus,
        SampleStatus newStatus
    )
        internal
        pure
        returns (bool)
    {
        if (
            currentStatus == SampleStatus.COLLECTED &&
            newStatus == SampleStatus.PROCESSING
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.PROCESSING &&
            newStatus == SampleStatus.TESTING
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.TESTING &&
            newStatus == SampleStatus.STORED
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.STORED &&
            newStatus == SampleStatus.TRANSFERRED
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.TRANSFERRED &&
            newStatus == SampleStatus.STORED
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.STORED &&
            newStatus == SampleStatus.RELEASED
        ) {
            return true;
        }

        if (
            currentStatus == SampleStatus.RELEASED &&
            newStatus == SampleStatus.DESTROYED
        ) {
            return true;
        }

        return false;
    }
}