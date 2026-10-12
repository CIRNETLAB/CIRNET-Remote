from abc import ABC, abstractmethod

class AnalogSimulationEngine(ABC):
    available=False
    @abstractmethod
    def simulate(self,plan): ...

class SPICEAdapter(AnalogSimulationEngine):
    """Boundary only; no installed SPICE engine or analog solver."""
    def simulate(self,plan): raise RuntimeError('ANALOG_UNAVAILABLE')

class MixedSignalCoordinator:
    available=False
    def simulate(self,plan): raise RuntimeError('MIXED_SIGNAL_UNAVAILABLE')
