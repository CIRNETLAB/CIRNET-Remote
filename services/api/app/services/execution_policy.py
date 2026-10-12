"""Safety decision deliberately has no topology-correctness argument."""
from contracts.validation import validate

class ExecutionPolicy:
    def decide(self,safety,executable,unknown=False):
        safety=validate("SafetyVerificationResult",safety)
        if safety["status"] != "SAFE":
            decision,reasons="BLOCK_SAFETY",[safety["status"]]
        elif not executable:
            decision,reasons="BLOCK_UNEXECUTABLE",["Required infrastructure unavailable"]
        elif unknown:
            decision,reasons="RUN_GUARDED",["Unknown component identity"]
        else:
            decision,reasons="RUN_NORMAL",[]
        return {"schema_version":"1.0","decision":decision,"reasons":reasons}
