from argparse import ArgumentParser
import json
import os


def error(code: int, message: str, do_exit: bool = False):
    result = {"error": code, "message": message}
    print(json.dumps(result))
    if do_exit:
        exit(1)


# try to import hatchet
try:
    import hatchet as ht
    import numpy as np
except ImportError:
    error(1000, "Hatchet is not installed. Please install it by running \"pip install hatchet\"", True)


# allow numpy arrays to be serialized to json
class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NpEncoder, self).default(obj)


def read_profile(fpath: os.PathLike, ptype: str):
    if ptype == 'hpctoolkit':
        return ht.GraphFrame.from_hpctoolkit(fpath)
    elif ptype == 'caliper':
        return ht.GraphFrame.from_caliper(fpath)
    elif ptype == 'tau':
        return ht.GraphFrame.from_tau(fpath)
    else:
        raise ValueError(f"Unknown profile type: {ptype}")


def get_tree(gf: ht.GraphFrame) -> dict:
    return gf.to_literal(cat_columns=["file", "line", "type"])


def get_hot_path(gf: ht.GraphFrame) -> list:
    # find the root with name 'main' or '<program root>'
    root = gf.graph.roots[0]
    for r in gf.graph.roots:
        if r.frame["name"] == 'main' or r.frame["name"] == '<program root>':
            root = r
            break

    return gf.hot_path(root)


def label_hot_path(tree: dict, hot_path: list) -> dict:
    def is_in_hot_path(node: dict) -> bool:
        return any(node["frame"] == hp for hp in hot_path)

    for node in tree:
        if is_in_hot_path(node):
            node["attributes"]['hot_path'] = True
        
        if 'children' in node:
            node["children"] = label_hot_path(node["children"], hot_path)
    
    return tree


def main():
    parser = ArgumentParser()
    parser.add_argument('--profile', type=str, required=True, help='Path to the profile file')
    parser.add_argument('--type', type=str, choices=['hpctoolkit', 'caliper', 'tau'], default='hpctoolkit', help='Type of the profile file')
    parser.add_argument('--hot-path', action='store_true', help='Whether to include the hot path in the output')
    args = parser.parse_args()

    # check that path exists
    if not os.path.exists(args.profile):
        error(1001, "Profile path does not exist", True)

    # read the profile
    try:
        gf = read_profile(args.profile, args.type)
    except ValueError as e:
        error(1002, str(e), True)
    except Exception as e:
        error(1003, "Unknown error reading in profile.", True)

    # collapse across ranks
    gf.drop_index_levels()

    # parse out tree from profile
    try:
        tree = get_tree(gf)
    except Exception as e:
        error(1004, "Unknown error parsing out tree from profile.", True)

    # get the hot path
    if args.hot_path:
        try:
            hot_path = get_hot_path(gf)
        except Exception as e:
            hot_path = []

    # add hot_path info to tree
    if args.hot_path and len(hot_path) > 0:
        hot_path = [dict(hp.frame.tuple_repr) for hp in hot_path]
        tree = label_hot_path(tree, hot_path)
    
    # print out the tree
    print(json.dumps(tree, cls=NpEncoder))



if __name__ == '__main__':
    main()
