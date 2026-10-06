// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AccessRoles {

    bytes32 public constant ADMIN_ROLE =
        keccak256("ADMIN_ROLE");

    bytes32 public constant BANK_OPERATOR_ROLE =
        keccak256("BANK_OPERATOR_ROLE");

    bytes32 public constant RESEARCHER_ROLE =
        keccak256("RESEARCHER_ROLE");

    bytes32 public constant AUDITOR_ROLE =
        keccak256("AUDITOR_ROLE");

    mapping(bytes32 => mapping(address => bool))
        private roles;

    address public admin;

    event RoleGranted(
        bytes32 indexed role,
        address indexed account,
        address indexed grantedBy
    );

    event RoleRevoked(
        bytes32 indexed role,
        address indexed account,
        address indexed revokedBy
    );

    constructor() {
        admin = msg.sender;

        roles[ADMIN_ROLE][msg.sender] = true;

        emit RoleGranted(
            ADMIN_ROLE,
            msg.sender,
            msg.sender
        );
    }

    modifier onlyAdmin() {
        require(
            roles[ADMIN_ROLE][msg.sender],
            "Not admin"
        );
        _;
    }

    function grantRole(
        bytes32 role,
        address account
    ) public onlyAdmin {

        require(
            account != address(0),
            "Invalid account"
        );

        roles[role][account] = true;

        emit RoleGranted(
            role,
            account,
            msg.sender
        );
    }

    function revokeRole(
        bytes32 role,
        address account
    ) public onlyAdmin {

        require(
            roles[role][account],
            "Role not assigned"
        );

        roles[role][account] = false;

        emit RoleRevoked(
            role,
            account,
            msg.sender
        );
    }

    function hasRole(
        bytes32 role,
        address account
    ) public view returns (bool) {

        return roles[role][account];
    }
}