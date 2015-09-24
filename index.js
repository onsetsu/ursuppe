var Optimize = {
    "Maximize": function (a, b) { return a >= b; }
    , "Minimize": function (a, b) { return a < b; }
};

var Select1 = {
    "Tournament2": function(pop) {
        var n = pop.length;
        var a = pop[Math.floor(Math.random()*n)];
        var b = pop[Math.floor(Math.random()*n)];
        return this.optimize(a.fitness, b.fitness) ? a.entity : b.entity;
    }, "Tournament3": function(pop) {
        var n = pop.length;
        var a = pop[Math.floor(Math.random()*n)];
        var b = pop[Math.floor(Math.random()*n)];
        var c = pop[Math.floor(Math.random()*n)];
        var best = this.optimize(a.fitness, b.fitness) ? a : b;
        best = this.optimize(best.fitness, c.fitness) ? best : c;
        return best.entity;
    }, "Fittest": function (pop) {
        return pop[0].entity;
    }, "Random": function (pop) {
        return pop[Math.floor(Math.random()*pop.length)].entity;
    }, "RandomLinearRank": function (pop) {
        this.internalGenState["rlr"] = this.internalGenState["rlr"]||0;
        return pop[Math.floor(Math.random()*Math.min(pop.length,(this.internalGenState["rlr"]++)))].entity;
    }, "Sequential": function (pop) {
        this.internalGenState["seq"] = this.internalGenState["seq"]||0;
        return pop[(this.internalGenState["seq"]++)%pop.length].entity;
    }
};

var Select2 = {
    "Tournament2": function(pop) {
        return [Select1.Tournament2.call(this, pop), Select1.Tournament2.call(this, pop)];
    }, "Tournament3": function(pop) {
        return [Select1.Tournament3.call(this, pop), Select1.Tournament3.call(this, pop)];
    }, "Random": function (pop) {
        return [Select1.Random.call(this, pop), Select1.Random.call(this, pop)];
    }, "RandomLinearRank": function (pop) {
        return [Select1.RandomLinearRank.call(this, pop), Select1.RandomLinearRank.call(this, pop)];
    }, "Sequential": function (pop) {
        return [Select1.Sequential.call(this, pop), Select1.Sequential.call(this, pop)];
    }, "FittestRandom": function (pop) {
        return [Select1.Fittest.call(this, pop), Select1.Random.call(this, pop)];
    }
};

var Genetic = Genetic || (function(){

    'use strict';

    // facilitates communcation between web workers
    var Serialization = {
        "stringify": function (obj) {
            return JSON.stringify(obj, function (key, value) {
                if (value instanceof Function || typeof value == "function") return "__func__:" + value.toString();
                if (value instanceof RegExp) return "__regex__:" + value;
                return value;
            });
        }, "parse": function (str) {
            return JSON.parse(str, function (key, value) {
                if (typeof value != "string") return value;
                if (value.lastIndexOf("__func__:", 0) === 0) return eval('(' + value.slice(9) + ')');
                if (value.lastIndexOf("__regex__:", 0) === 0) return eval('(' + value.slice(10) + ')');
                return value;
            });
        }
    };

    function Genetic() {

        // population
        this.fitness = null;
        this.seed = null;
        this.mutate = null;
        this.crossover = null;
        this.select1 = null;
        this.select2 = null;
        this.optimize = null;
        this.generation = null;
        this.notification = null;

        this.configuration = {
            "size": 250
            , "crossover": 0.9
            , "mutation": 0.2
            , "iterations": 100
            , "fittestAlwaysSurvives": true
            , "maxResults": 100
            , "skip": 0
        };

        this.userData = {};
        this.internalGenState = {};

        this.entities = [];

        this.callbacks = {
            'finished': []
        };

        this.start = function() {

            var i;

            // seed the population
            for (i=0;i<this.configuration.size;++i)  {
                this.entities.push(this.seed());
            }

            for (i=0;i<this.configuration.iterations;++i) {
                // reset for each generation
                this.internalGenState = {};

                // score and sort
                var pop = this.entities
                    .map(function (entity) {
                        return {"fitness": this.fitness(entity), "entity": entity };
                    }, this)
                    .sort((function (a, b) {
                        return this.optimize(a.fitness, b.fitness) ? -1 : 1;
                    }).bind(this));

                // generation notification
                var mean = pop.reduce(function (a, b) { return a + b.fitness; }, 0)/pop.length;
                var stdev = Math.sqrt(pop
                        .map(function (a) { return (a.fitness - mean) * (a.fitness - mean); })
                        .reduce(function (a, b) { return a+b; }, 0)/pop.length);

                var stats = {
                    "maximum": pop[0].fitness
                    , "minimum": pop[pop.length-1].fitness
                    , "mean": mean
                    , "stdev": stdev
                };

                var r = this.generation ? this.generation(pop, i, stats) : true;
                var isFinished = (typeof r != "undefined" && !r) || (i == this.configuration.iterations-1);

                if (
                    //this.notification
                    //&&
                    (isFinished || this.configuration["skip"] == 0 || i%this.configuration["skip"] == 0)
                ) {
                    this.sendNotification(pop.slice(0, this.maxResults), i, stats, isFinished);
                }

                if(isFinished) {
                    var response = {
                        "pop": pop.slice(0, this.maxResults).map(Serialization.stringify)
                        , "generation": i
                        , "stats": stats
                        , "isFinished": isFinished
                    };

                    this.callbacks['finished'].forEach(function(callback) {
                        callback.call(this, response.pop.map(Serialization.parse), response.generation, response.stats, response.isFinished);
                    }, this);
                }

                if (isFinished)
                    break;

                this.breed(pop);
            }
        }
    }

    Genetic.prototype.breed = function(pop) {
        var mutateOrNot = (function(entity) {
            // applies mutation based on mutation probability
            return Math.random() <= this.configuration.mutation && this.mutate ? this.mutate(entity) : entity;
        }).bind(this);

        // crossover and mutate
        var newPop = [];

        if (this.configuration.fittestAlwaysSurvives) { // lets the best solution fall through
            newPop.push(pop[0].entity);
        }

        while (newPop.length < this.configuration.size) {
            if (
                this.crossover // if there is a crossover function
                && Math.random() <= this.configuration.crossover // base crossover on specified probability
                && newPop.length+1 < this.configuration.size // keeps us from going 1 over the max population size
            ) {
                var parents = this.select2(pop);
                var children = this.crossover(parents[0], parents[1]).map(mutateOrNot);
                newPop.push(children[0], children[1]);
            } else {
                newPop.push(mutateOrNot(this.select1(pop)));
            }
        }

        this.entities = newPop;
    };

    Genetic.prototype.on = function(eventName, callback) {
        this.callbacks[eventName].push(callback);
    };

    Genetic.prototype.sendNotification = function(pop, generation, stats, isFinished) {
        var response = {
            "pop": pop.map(Serialization.stringify)
            , "generation": generation
            , "stats": stats
            , "isFinished": isFinished
        };

        this.notification && this.notification(response.pop.map(Serialization.parse), response.generation, response.stats, response.isFinished);
    };

    Genetic.prototype.evolve = function(config, userData) {

        var k;
        for (k in config) {
            this.configuration[k] = config[k];
        }

        for (k in userData) {
            this.userData[k] = userData[k];
        }

        this.start(null);
    };

    return {
        "create": function() {
            return new Genetic();
        }, "Select1": Select1
        , "Select2": Select2
        , "Optimize": Optimize
    };

})();

module.exports = Genetic;
