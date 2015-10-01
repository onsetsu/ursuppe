var Genetic = require("../index.js");
var assert = require("assert");

describe("Promise", function() {
	it("can use promises everywhere", function (done) {
		var genetic = Genetic.create();
		genetic.optimize = Genetic.Optimize.Minimize;
		genetic.select1 = Genetic.Select1.Tournament2;

		// start with random number between 0 and 99
		genetic.seed = function() {
			return Math.floor(Math.random() * 100);
		};

		// randomly increament or decrement numbers by 1
		genetic.mutate = function(entity) {
			//console.log(entity);
			return Math.random() <= 0.5 ? entity - 1 : entity + 1;
		};

		// fitness equals difference to 50
		genetic.fitness = function(entity) {
			return Math.abs(entity - 50);
		};

		// termination criteria
		genetic.generation = function(pop, i, stats) {
			return pop[0].fitness !== 0;
		};

		genetic.on("finished", function(pop, generation, stats) {
			console.log(stats);
			for (i=0;i<pop.length;++i) {
				//console.log(pop[i].fitness, pop[i].entity);
			}
		});

		var config = {
			iterations: 20,
			size: 30,
			crossover: 1.0,
			fittestAlwaysSurvives: false
		};
		genetic.evolve(config).then(function() {
			done();
		});
	});
});
