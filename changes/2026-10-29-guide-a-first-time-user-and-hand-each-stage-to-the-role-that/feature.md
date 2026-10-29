# Guide a first-time user and hand each stage to the role that lists it

A person who has not used sdd can run `sdd setup`. That initializes the folder and, when no role files exist, writes planner, architect, and builder. Each role lists the stages of the workflow named with `-w`. The default workflow is feature.

`sdd go "I want to build this"` opens the change. The role for the current stage asks its `ask_human_when` questions one at a time. An answer is `sdd go --answer "..."`. On a terminal the same command asks in place. When the draft is written, the guide moves to the next stage and hands the work to the role that lists it. Optional clarify and brainstorm stages are skipped.

A hard gate that names a human stops. The role does not sign it. A role whose `never` list says `write product code` can write only inside the change pack. Push, a pull request, and merge stay refused. There is still no sandbox.

This reading is a proposal. The person has not signed it.

Success: `sdd setup` prints the three roles, `sdd go` asks the planner's first question before any model call, the next answer moves the draft to the architect, and a human gate stops without a review file.
