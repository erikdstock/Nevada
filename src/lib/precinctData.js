import parseCsv from "csv-parse/lib/sync";
import _ from "lodash";

export const precinctId = candidateRow => {
  const { county_fips, state_fips } = candidateRow;
  return `${state_fips}${county_fips}`;
};

export const flattenPrecincts = data => {
  const { electionData } = data;
  const countyKeys = Object.keys(electionData);
  const precincts = countyKeys.flatMap(c =>
    Object.keys(electionData[c]).map(p => electionData[c][p])
  );
  return precincts.reduce((acc, p) => {
    const firstResult = p[Object.keys(p)[0]];
    acc[precinctId(firstResult)] = p;
    return acc;
  }, {});
};

const falsey = str => !str || str === "FALSE" || str === "NA";

export const massageResult = csv => {
  const jsResults = parseCsv(csv, {
    columns: true,
    skip_empty_lines: true
  }).slice(0, 100);
  // console.log({ jsResults });
  let countyLevelGroup = _.groupBy(jsResults, "county");
  let electionData = _.reduce(
    countyLevelGroup,
    function(result, county, countyKey) {
      let precinctGroup = _.groupBy(county, "precinct");
      precinctGroup = _.reduce(
        precinctGroup,
        function(precinctResult, precinct, key) {
          let candidate = _.groupBy(precinct, "candidate");
          precinctResult[key] = _.reduce(
            candidate,
            function(candidateResult, c, candidateKey) {
              candidateResult[candidateKey] = c[0]; // In the future we can reduce this to a sparser model here.
              return candidateResult;
            },
            {}
          );
          return precinctResult;
        },
        {}
      );
      result[countyKey] = precinctGroup;
      return result;
    },
    {}
  );

  function toAlerts(row) {
    return row; //adapt model however we like.
  }

  function toWarnings(row) {
    return row; //adapt model however we like.
  }

  function isFalse(row, prop) {
    return falsey(row[prop]);
  }

  let viableLoss = _.filter(jsResults, row => !isFalse(row, "viable_loss")).map(
    toAlerts
  );
  let moreFinalVotes = _.filter(
    jsResults,
    row => !isFalse(row, "more_final_votes")
  ).map(toAlerts);
  let nonviableNoRealign = _.filter(
    jsResults,
    row => !isFalse(row, "nonviable_no_realign")
  ).map(toAlerts);

  let delCountsDiff = _.filter(
    jsResults,
    row => !isFalse(row, "del_counts_diff")
  ).map(toWarnings);
  let hasAlphaShift = _.filter(
    jsResults,
    row => !isFalse(row, "has_alpha_shift")
  ).map(toWarnings);
  let fewerFinalVotes = _.filter(
    jsResults,
    row => !isFalse(row, "fewer_final_votes")
  ).map(toWarnings);
  let extraDelGiven = _.filter(
    jsResults,
    row => !isFalse(row, "extra_del_given")
  ).map(toWarnings);

  let alerts = { viableLoss, moreFinalVotes, nonviableNoRealign };
  let warnings = {
    delCountsDiff,
    hasAlphaShift,
    fewerFinalVotes,
    extraDelGiven
  };
  return { electionData, alerts, warnings };
};

const candidateNames = {
  liz: "Warren",
  pete: "BootEdgeEdge",
  tulsi: "Gabbard",
  joe: "Biden",
  amy: "Klobuchar",
  bernie: "Sanders",
  mike: "Bloomberg"
};

// for a given message type, a string or precinct => string function
const messageMap = {
  countySucks: precinct => `${precinct.county} sucks`,
  viableLoss: "1st-round viable candidate lost votes in round 2",
  nonviableNoRealign:
    "1st-round nonviable candidate did not realign in round 2",
  alphaShift: precinct =>
    `Alphabetical shift in voting detected for ${precinct["has_alpha_shift"]}`,
  moreFinalVotes: `More votes in final alignment than 1st alignment`,
  fewerFinalVotes: `Fewer votes in final alignment than 1st alignment`,
  delCountsDiff: "Our delegate counts differ from those reported",
  extraDelGiven:
    "Too many delegates given out but all candidates had 1 delegate, so an extra delegate was given"
};

export const readableMessage = (key, precinct) => {
  const message = messageMap[key];
  return message && typeof message === "function" ? message(precinct) : message;
};

export const candidateDisplayName = key => candidateNames[key] || key;

const precinctKeys = [
  "viabilty_threshold",
  "has_alpha_shift",
  "more_final_votes",
  "fewer_final_votes",
  "game_of_chance",
  "extra_del_given"
];
const metaKeys = [
  "row_id",
  "county",
  "precinct",
  "precinct_full",
  "precinct_delegates",
  "county_fips",
  "state_fips",
  "GEOID10"
];
const candidateKeys = [
  "candidate",
  "align1",
  "alignfinal",
  "total_align1",
  "total_alignfinal",
  "viability_threshold",
  "viable1",
  "viablefinal",
  "viable_loss",
  "nonviable_no_realign",
  "alpha_shift",
  "caucus_formula_result",
  "after_rounding",
  "total_del_after_rounding",
  "final_del",
  "total_final_del",
  "distance_next",
  "farthest_rank",
  "closest_rank",
  "min_far_rank",
  "is_farthest",
  "min_close_rank",
  "is_closest",
  "how_many_farthest",
  "how_many_closest",
  "comments",
  "tie_winner",
  "tie_loser"
];

export const refinePrecinct = candidatesByPrecinct => {
  const candidateLevel = Object.keys(candidatesByPrecinct).reduce(
    (acc, key) => {
      const thisResult = candidatesByPrecinct[key];

      const candidateData = candidateKeys.reduce((acc, k) => {
        const value = thisResult[k];
        acc[k] = falsey(value) ? false : value;
        return acc;
      }, {});
      // return {...acc, [key]: candidateData}
      acc[key] = candidateData;
      return acc;
    },
    {}
  );

  const precinctLevel = Object.keys(candidatesByPrecinct).reduce((acc, key) => {
    const thisResult = candidatesByPrecinct[key];
    const precinctData = precinctKeys.reduce((acc, k) => {
      const value = thisResult[k];
      acc[k] = falsey(value) ? false : value;
      return acc;
    }, {});
    if (acc && JSON.stringify(acc) !== JSON.stringify(precinctData)) {
      console.log("precinct data does not match across candidates", {
        acc,
        precinctData
      });
    }
    return precinctData;
  }, null);

  const meta = _.pick(
    candidatesByPrecinct[Object.keys(candidatesByPrecinct)[0]],
    metaKeys
  );

  return {
    meta,
    candidates: candidateLevel,
    precinct: precinctLevel
  };
};

/*
# A tibble: 19 x 2
   colnames             description                                                                                                                
   <chr>                <chr>                                                                                                                      
 1 county               ""                                                                                                                         
 2 precinct             ""                                                                                                                         
 3 candidate            ""                                                                                                                         
 4 precinct_delegates   # of delegates to be given by precinct                                                                                     
 5 align1               # of votes for candidate in 1st alignment                                                                                  
 6 alignfinal           # of votes for candidate in final alignment   

 7 final_del            our calculated # of delegates earned                                                                                       
 8 reported_del         the reported # of delegates earned

 9 game_of_chance       string: type of game of chance required                                                                                    
10 tie_winner           string: winner of an extra delegate in a tie                                                                               
11 tie_loser            string: loser of an extra delegate in a tie                                                                                

12 viable_loss          logical: if a candidate was viable in 1st round and lost votes going to final round                                        
13 nonviable_no_realign logical: if a nonviable candidate from 1st round did not realign in final round                                            
14 alpha_shift          string: name of candidate that had alphabetical shift                                                                      
15 has_alpha_shift      logical: alphabetical shift in vote reporting detected. warning, not error                                                 
16 more_final_votes     logical: more votes in final alignment than 1st alignment                                                                  
17 fewer_final_votes    logical: fewer votes in final alignment than 1st. warning, not error                                                       
18 del_counts_diff      logical: our delegate counts differ from those reported                                                                    
19 extra_del_given      logical: too many delegates given out but all candidates had 1 delegate, so an extra delegate was given. warning, not error
*/

export const _rowFixture = {
  delaneyj: {
    row_id: "1",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "delaneyj",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  bennetm: {
    row_id: "2",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "bennetm",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  bidenj: {
    row_id: "3",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "bidenj",
    align1: "24",
    alignfinal: "25",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "TRUE",
    viablefinal: "TRUE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "3.2967",
    after_rounding: "3",
    total_del_after_rounding: "12",
    final_del: "3",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  bloombergm: {
    row_id: "4",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "bloombergm",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  buttigiegp: {
    row_id: "5",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "buttigiegp",
    align1: "30",
    alignfinal: "35",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "TRUE",
    viablefinal: "TRUE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "4.6154",
    after_rounding: "5",
    total_del_after_rounding: "12",
    final_del: "5",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  gabbardt: {
    row_id: "6",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "gabbardt",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  klobuchara: {
    row_id: "7",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "klobuchara",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  other: {
    row_id: "8",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "other",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  patrickd: {
    row_id: "9",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "patrickd",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  sandersb: {
    row_id: "10",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "sandersb",
    align1: "21",
    alignfinal: "31",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "TRUE",
    viablefinal: "TRUE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "4.0879",
    after_rounding: "4",
    total_del_after_rounding: "12",
    final_del: "4",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  steyert: {
    row_id: "11",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "steyert",
    align1: "2",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  uncommitted: {
    row_id: "12",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "uncommitted",
    align1: "0",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  warrene: {
    row_id: "13",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "warrene",
    align1: "4",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  },
  yanga: {
    row_id: "14",
    county: "CARSON CITY",
    precinct: "101",
    precinct_full: "101",
    precinct_delegates: "12",
    candidate: "yanga",
    align1: "10",
    alignfinal: "0",
    county_fips: "510",
    state_fips: "32",
    GEOID10: "32510101",
    total_align1: "91",
    total_alignfinal: "91",
    viability_threshold: "14",
    viable1: "FALSE",
    viablefinal: "FALSE",
    viable_loss: "FALSE",
    nonviable_no_realign: "FALSE",
    alpha_shift: "NA",
    has_alpha_shift: "NA",
    more_final_votes: "FALSE",
    fewer_final_votes: "FALSE",
    caucus_formula_result: "0",
    after_rounding: "0",
    total_del_after_rounding: "12",
    final_del: "0",
    total_final_del: "12",
    distance_next: "NA",
    farthest_rank: "NA",
    closest_rank: "NA",
    min_far_rank: "Inf",
    is_farthest: "NA",
    min_close_rank: "Inf",
    is_closest: "NA",
    how_many_farthest: "0",
    how_many_closest: "0",
    game_of_chance: "no_tie",
    extra_del_given: "FALSE",
    comments: "NA",
    tie_winner: "NA",
    tie_loser: "NA"
  }
};
