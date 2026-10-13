"""Mini PC transport boundary. No board adapter is electrically implemented."""
from abc import ABC, abstractmethod
import math
from hardware_service.station.base import HardwareError, HardwareUnavailableError


class FpgaTransport(ABC):
    @property
    @abstractmethod
    def available(self)->bool: ...

    @abstractmethod
    def exchange(self,frame:bytes,*,timeout_s:float)->bytes:
        """Bounded exchange of protocol bytes; never implies electrical safety."""


class UnavailableFpgaTransport(FpgaTransport):
    available=False

    def exchange(self,frame:bytes,*,timeout_s:float)->bytes:
        if not isinstance(frame,bytes) or not frame or type(timeout_s) not in (int,float) or not math.isfinite(timeout_s) or timeout_s<=0:
            raise HardwareError('INVALID_CONFIGURATION')
        raise HardwareUnavailableError()


class SerialFpgaTransport(UnavailableFpgaTransport):
    """Reserved for selected serial device/framing/reset/watchdog integration."""


class UsbSpiFpgaTransport(UnavailableFpgaTransport):
    """Reserved for selected bridge IC and measured SPI/USB framing."""
