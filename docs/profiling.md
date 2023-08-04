# Profiling

This extension provides a number of tools to assist in collecting performance
profiles.
This page documents how to use each of these features.

- [Profiling](#profiling)
  - [Profiling Tasks](#profiling-tasks)
    - [PyInstrument Task](#pyinstrument-task)
    - [cProfile Task](#cprofile-task)
    - [HPCToolkit Task](#hpctoolkit-task)

## Profiling Tasks
A set of [VSCode Tasks](https://code.visualstudio.com/docs/editor/tasks) are 
provided to wrap the CLI functionality of the profilers.
These can be used by defining them as tasks in your `tasks.json` file and 
selecting them from the Run Tasks VSCode menu.
See the 
[VSCode Tasks documentation](https://code.visualstudio.com/docs/editor/tasks) 
for more details on defining and running tasks.
Currently task definitions are provided for PyInstrument, cProfile, and
HPCToolkit.

### PyInstrument Task

Task definition:
```json
{
    "type": "PyInstrument", // PyInstrument task
    "program": "...",       // Python program to execute
    "args": [],             // [Optional] arguments to pass to 'program'
    "outputFile": "...",    // [Optional] where to output results
    "renderer": "..."       // [Optional] output format. text, html, json, or speedscope. defaults to json.
},
```

Example:
```json
{
    "type": "PyInstrument",
    "program": "main.py",
    "outputFile": "main-profile.json"
}
```

### cProfile Task

Task definition:
```json
{
    "type": "cProfile",     // cProfile task
    "program": "...",       // Python program to execute
    "args": [],             // [Optional] arguments to pass to 'program'
    "outputFile": "...",    // [Optional] where to output results
    "pythonCommand": "..."  // [Optional] what Python command to use when running 'python -m cProfile ...'
}
```

Example:
```json
{
    "type": "cProfile",
    "program": "main.py",
    "outputFile": "main.profile"
}
```

### HPCToolkit Task

Task definition:
```json
{
    "type": "HPCToolkit",           // HPCToolkit task
    "program": "...",               // executable to profile
    "measurementsDirectory": "...", // directory to store measurements files in
    "outputDirectory": "...",       // [Optional] directory to store final database
    "args": [],                     // [Optional] arguments to pass to 'program'
    "metrics": [],                  // [Optional] metrics to profile. run 'hpcrun -L' for options.
    "createDatabase": true,         // [Optional] whether to create analysis database of measurements
    "howOften": "...",              // [Optional] sampling frequency
    "trace": false,                 // [Optional] whether to record trace or not
    "useMPI": false,                // [Optional] use MPI to run the code
    "mpiCmd": "...",                // [Optional] what MPI command to use. defaults to mpirun.
    "mpiRanks": 1,                  // [Optional] how many MPI ranks to use if using MPI. defaults to 1.
    "metricDB": true,               // [Optional] whether to create metricDatabase in final DB
}
```

Example:
```json
{
    "type": "HPCToolkit",
    "program": "solver",
    "args": ["-s"],
    "measurementsDirectory": "hpctoolkit-solver-measurements",
    "metrics": ["REALTIME"],
    "createDatabase": true,
    "metricDB": true,
    "outputDirectory": "hpctoolkit-solver-database"
}
```