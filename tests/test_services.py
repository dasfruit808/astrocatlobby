from astrocatlobby.models import AstroCat
from astrocatlobby.services import LobbyService


def test_register_and_list_cats():
    service = LobbyService()
    service.register_cat("Nova", "Captain")
    service.register_cat("Comet", "Lieutenant")

    cats = service.list_cats()
    assert [cat.name for cat in cats] == ["Nova", "Comet"]


def test_assign_mission_updates_cat():
    service = LobbyService()
    service.register_cat("Luna", "Specialist")
    updated = service.assign_mission("Luna", "Survey the Andromeda sector")

    assert updated.missions == ["Survey the Andromeda sector"]
    assert service.get_cat("Luna").missions == ["Survey the Andromeda sector"]


def test_duplicate_registration_is_rejected():
    service = LobbyService()
    service.register_cat("Nova", "Captain")

    try:
        service.register_cat("Nova", "Commander")
    except ValueError as exc:
        assert "already registered" in str(exc)
    else:
        raise AssertionError("Expected duplicate registration to fail")


def test_serialisation_roundtrip():
    service = LobbyService()
    cat = service.register_cat("Nova", "Captain")
    service.assign_mission("Nova", "Inspect moon base")

    data = service.to_dict()
    restored = LobbyService.from_dict(data)

    restored_cat = restored.get_cat("Nova")
    assert restored_cat.rank == cat.rank
    assert restored_cat.missions == ["Inspect moon base"]
