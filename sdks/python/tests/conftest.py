"""Pytest configuration and fixtures for SynapticChain SDK tests."""

import pytest

from synapticchain import Address, Keypair


@pytest.fixture
def keypair() -> Keypair:
    """Generate a test keypair."""
    return Keypair.generate()


@pytest.fixture
def zero_address() -> Address:
    """Create a zero address."""
    return Address.zero()


@pytest.fixture
def sample_address() -> Address:
    """Create a sample address from a known keypair."""
    # Use a deterministic private key for reproducible tests
    private_key = bytes.fromhex("0" * 64)
    keypair = Keypair.from_private_key(private_key)
    return keypair.address()
