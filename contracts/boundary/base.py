"""Runtime integration for generated Pydantic boundaries, without shape ownership."""
from typing import Any, ClassVar, Generic, TypeVar

from jsonschema import ValidationError as SchemaValidationError
from pydantic import BaseModel, ConfigDict, RootModel, ValidationInfo, model_validator
from pydantic_core import PydanticCustomError


def preserve_json_literal(literals):
    """Keep integral JSON floats unchanged instead of Literal's 1.0 -> 1 cast.

    The literals are emitted by the pinned schema generator. Numeric equality
    follows JSON Schema, with booleans kept distinct from numeric values.
    """
    def validate(value, _handler):
        for literal in literals:
            same_kind = type(value) is type(literal) or type(value) in (int, float) and type(literal) in (int, float)
            if same_kind and value == literal:
                return value
        raise ValueError('Value does not match the canonical literal')
    return validate


class CanonicalValidation:
    __contract_id__: ClassVar[str | None] = None
    __validation_profile__: ClassVar[str] = 'structural'

    @model_validator(mode='before')
    @classmethod
    def validate_canonical_document(cls, value: Any, info: ValidationInfo) -> Any:
        if isinstance(value, cls):
            return value
        if cls.__contract_id__ is not None:
            from contracts.registry import validate_contract
            profile = info.context.get('profile', cls.__validation_profile__) if isinstance(info.context, dict) else cls.__validation_profile__
            try:
                return validate_contract(cls.__contract_id__, value, profile=profile)
            except SchemaValidationError as error:
                from contracts.semantic_profiles import validation_issues
                issues = [{**issue, 'message': 'The field does not match its declared contract.'}
                          for issue in validation_issues(error, profile)]
                raise PydanticCustomError('canonical_contract', 'The value does not match its canonical contract.',
                                          {'issues': issues}) from None
        return value

    def model_dump(self, **kwargs: Any) -> Any:
        kwargs.setdefault('exclude_unset', True)
        return super().model_dump(**kwargs)

    def model_dump_json(self, **kwargs: Any) -> str:
        kwargs.setdefault('exclude_unset', True)
        return super().model_dump_json(**kwargs)


class ContractBoundary(CanonicalValidation, BaseModel):
    model_config = ConfigDict(strict=True, extra='allow', allow_inf_nan=False)


RootValue = TypeVar('RootValue')


class ContractRootBoundary(CanonicalValidation, RootModel[RootValue], Generic[RootValue]):
    model_config = ConfigDict(strict=True, allow_inf_nan=False)
